<?php

namespace App\Services;

use App\Models\ReagentCalculation;
use App\Models\SampleTest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;


class ReagentCalcService
{
    private const MAX_ITEMS = 200;
    private const MAX_TRACE = 50;
    private const MAX_NOTE_LEN = 200;

    public function __construct(
        private readonly ReagentCalcRuleResolver $resolver = new ReagentCalcRuleResolver(),
        private readonly ReagentCalcFormulaEvaluator $evaluator = new ReagentCalcFormulaEvaluator(),
    ) {}

    /**
     * Baseline after SampleTest bulk create.
     */
    public function upsertBaselineForSample(int $sampleId, ?int $actorStaffId = null): ReagentCalculation
    {
        return $this->upsertComputedPayload(
            sampleId: $sampleId,
            trigger: 'baseline',
            actorStaffId: $actorStaffId,
            ref: []
        );
    }

    /**
     * Recompute after event/status change.
     */
    public function recomputeForSample(int $sampleId, string $trigger, ?int $actorStaffId = null, array $ref = []): ReagentCalculation
    {
        return $this->upsertComputedPayload(
            sampleId: $sampleId,
            trigger: $trigger,
            actorStaffId: $actorStaffId,
            ref: $ref
        );
    }

    private function upsertComputedPayload(int $sampleId, string $trigger, ?int $actorStaffId, array $ref): ReagentCalculation
    {
        return DB::transaction(function () use ($sampleId, $trigger, $actorStaffId, $ref) {
            $actorId = $this->resolveActorStaffId($actorStaffId);

            $calc = ReagentCalculation::query()
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->first();

            // If locked by final approval, do not overwrite.
            if ($calc && (bool)($calc->locked ?? false) === true) {
                return $calc;
            }

            $payload = $this->computePayload($sampleId, $trigger, $actorId, $ref);

            if (!$calc) {
                $calc = new ReagentCalculation();
                $calc->sample_id = $sampleId;
                $calc->locked = false; // allow engine to run
            }

            // ✅ satisfy NOT NULL constraint + audit fields if exist
            $this->setIfColumnExists($calc, 'computed_by', $actorId);
            $this->setIfColumnExists($calc, 'computed_at', now());
            $this->setIfColumnExists($calc, 'updated_by', $actorId);

            $calc->payload = $payload;
            $calc->save();

            return $calc;
        }, 3);
    }

    private function computePayload(int $sampleId, string $trigger, ?int $actorStaffId, array $ref): array
    {
        // Memory-safe: load only minimal columns
        $tests = SampleTest::query()
            ->select(['sample_test_id', 'method_id', 'parameter_id', 'status'])
            ->where('sample_id', $sampleId)
            ->get();

        $itemsAgg = []; // key: reagent_code|unit
        $missing = [];
        $trace = $this->buildTraceEntry($trigger, $ref);

        foreach ($tests as $t) {
            $methodId = $t->method_id ? (int)$t->method_id : null;
            $parameterId = $t->parameter_id ? (int)$t->parameter_id : null;

            $rule = $this->resolver->resolve($methodId, $parameterId);
            if (!$rule) {
                $missing[] = [
                    'sample_test_id' => (int)$t->sample_test_id,
                    'method_id' => $methodId,
                    'parameter_id' => $parameterId,
                ];
                continue;
            }

            $ruleJson = is_array($rule->rule_json) ? $rule->rule_json : [];
            $qc = (array)($ruleJson['qc'] ?? []);
            $rounding = (array)($ruleJson['rounding'] ?? []);

            $blankRuns = (int)($qc['blank_runs'] ?? 0);
            $controlRuns = (int)($qc['control_runs'] ?? 0);
            $qcRuns = (int)($qc['qc_runs'] ?? 0);
            $overagePct = (float)($qc['overage_pct'] ?? 0);

            // v1: runs = 1 per sample_test (repeat/rerun handled later in Step 7)
            $runs = 1;
            $qcTotal = $blankRuns + $controlRuns + $qcRuns;

            $reagents = (array)($ruleJson['reagents'] ?? []);
            foreach ($reagents as $r) {
                if (!is_array($r)) continue;

                $code = (string)($r['reagent_code'] ?? '');
                $unit = (string)($r['unit'] ?? '');
                $formula = (array)($r['formula'] ?? []);

                if ($code === '' || $unit === '') continue;

                // Expression formula currently unsupported (safe default)
                if (($formula['type'] ?? null) === 'expression') {
                    $trace[] = $this->note("expression formula unsupported for reagent_code={$code}");
                }

                $vars = [
                    'runs' => $runs,
                    'blank_runs' => $blankRuns,
                    'control_runs' => $controlRuns,
                    'qc_runs' => $qcRuns,
                    'overage_pct' => $overagePct,
                ];

                $base = $this->evaluator->compute($formula, ['runs' => $runs] + $vars);
                $qcVal = $this->evaluator->compute($formula, ['runs' => $qcTotal] + $vars);

                $subtotal = $base + $qcVal;
                $overage = ($overagePct > 0) ? ($subtotal * $overagePct / 100.0) : 0.0;
                $total = $subtotal + $overage;

                $total = $this->applyRounding($total, $rounding);

                $key = $code . '|' . $unit;

                if (!isset($itemsAgg[$key])) {
                    $itemsAgg[$key] = [
                        'reagent_code' => $code,
                        'unit' => $unit,
                        'estimated_usage' => 0.0,
                        'rule_scope' => [
                            'method_id' => $methodId,
                            'parameter_id' => $parameterId,
                        ],
                        'runs' => 0,
                        'breakdown' => [
                            'base' => 0.0,
                            'qc' => 0.0,
                            'overage' => 0.0,
                        ],
                        'lots' => [],
                    ];
                }

                $itemsAgg[$key]['estimated_usage'] += $total;
                $itemsAgg[$key]['runs'] += $runs;
                $itemsAgg[$key]['breakdown']['base'] += $base;
                $itemsAgg[$key]['breakdown']['qc'] += $qcVal;
                $itemsAgg[$key]['breakdown']['overage'] += $overage;
            }
        }

        $items = array_values($itemsAgg);

        // Hard caps (memory-safe)
        if (count($items) > self::MAX_ITEMS) {
            $items = array_slice($items, 0, self::MAX_ITEMS);
            $trace[] = $this->note("items truncated to " . self::MAX_ITEMS);
        }

        $state = !empty($missing)
            ? 'missing_rules'
            : ($trigger === 'baseline' ? 'baseline' : 'adjusted');

        $totalUl = 0.0;
        foreach ($items as $it) {
            // Sum only uL to avoid unit assumptions
            if (($it['unit'] ?? '') === 'uL') {
                $totalUl += (float)($it['estimated_usage'] ?? 0);
            }
        }

        return [
            'schema_version' => 1,
            'state' => $state,
            'computed_at' => now()->toIso8601String(),
            'sample_id' => $sampleId,
            'summary' => [
                'items_count' => count($items),
                'total_estimated_volume_uL' => $totalUl,
            ],
            'items' => $items,
            'missing' => $missing,
            'trace' => $this->capTrace($trace),
            'last_event' => [
                'trigger' => $trigger,
                'actor_staff_id' => $actorStaffId,
                'ref' => $ref,
            ],
        ];
    }

    private function applyRounding(float $val, array $rounding): float
    {
        $mode = (string)($rounding['mode'] ?? 'ceil');
        $precision = (int)($rounding['precision'] ?? 2);

        if ($precision < 0) $precision = 0;
        if ($precision > 6) $precision = 6;

        $factor = pow(10, $precision);

        if ($mode === 'ceil') {
            return ceil($val * $factor) / $factor;
        }

        if ($mode === 'floor') {
            return floor($val * $factor) / $factor;
        }

        return round($val, $precision);
    }

    private function buildTraceEntry(string $event, array $ref): array
    {
        return [[
            'ts' => now()->toIso8601String(),
            'event' => $event,
            'ref' => $ref,
            'note' => 'reagent calc computed',
        ]];
    }

    private function note(string $note): array
    {
        if (strlen($note) > self::MAX_NOTE_LEN) {
            $note = substr($note, 0, self::MAX_NOTE_LEN);
        }

        return [
            'ts' => now()->toIso8601String(),
            'event' => 'note',
            'ref' => [],
            'note' => $note,
        ];
    }

    private function capTrace(array $trace): array
    {
        $trace = array_values($trace);

        if (count($trace) > self::MAX_TRACE) {
            $trace = array_slice($trace, -self::MAX_TRACE);
        }

        foreach ($trace as &$t) {
            if (isset($t['note']) && is_string($t['note']) && strlen($t['note']) > self::MAX_NOTE_LEN) {
                $t['note'] = substr($t['note'], 0, self::MAX_NOTE_LEN);
            }
        }

        return $trace;
    }

    private function resolveActorStaffId(?int $actorStaffId): int
    {
        if ($actorStaffId && $actorStaffId > 0) {
            return $actorStaffId;
        }

        // Try from logged-in user
        $user = Auth::user();
        if ($user) {
            // common patterns: user->staff_id OR user->staff->staff_id
            $sid = null;

            if (isset($user->staff_id) && is_numeric($user->staff_id)) {
                $sid = (int) $user->staff_id;
            } elseif (method_exists($user, 'staff') && $user->staff && isset($user->staff->staff_id)) {
                $sid = (int) $user->staff->staff_id;
            }

            if ($sid && $sid > 0) return $sid;
        }

        throw new \RuntimeException(
            "ReagentCalcService requires actorStaffId because reagent_calculations.computed_by is NOT NULL. " .
                "Pass a valid staff_id when calling upsertBaselineForSample()/recomputeForSample()."
        );
    }

    private function setIfColumnExists(ReagentCalculation $calc, string $column, mixed $value): void
    {
        static $cols = null;

        if ($cols === null) {
            $cols = [];
            foreach (['computed_by', 'computed_at', 'updated_by', 'updated_at'] as $c) {
                $cols[$c] = Schema::hasColumn('reagent_calculations', $c);
            }
        }

        if (!empty($cols[$column])) {
            $calc->{$column} = $value;
        }
    }
}