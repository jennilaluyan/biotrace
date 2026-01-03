<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ReagentCalculation;
use App\Models\SampleTest;
use App\Models\TestResult;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReagentCalcService
{
    /**
     * Schema version for payload contract.
     */
    private const SCHEMA_VERSION = 1;

    /**
     * Keep trace bounded to avoid payload growth / memory bloat.
     */
    private const TRACE_MAX = 50;

    /**
     * Create/update a baseline reagent calculation row for a sample.
     * Used after bulk create sample tests.
     */
    public function upsertBaselineForSample(int $sampleId, int $actorStaffId): ReagentCalculation
    {
        return $this->recomputeForSample(
            $sampleId,
            'baseline',
            $actorStaffId,
            [
                'ref' => [],
            ]
        );
    }

    /**
     * Recompute reagent calculations for a sample.
     *
     * @param string $trigger baseline|created|updated|cancelled|rerun
     * @param array  $ref     compact reference metadata (ids, status change, etc.)
     */
    public function recomputeForSample(
        int $sampleId,
        string $trigger,
        int $actorStaffId,
        array $ref = []
    ): ReagentCalculation {
        if ($sampleId <= 0) {
            throw new \InvalidArgumentException('sampleId must be positive.');
        }
        if ($actorStaffId <= 0) {
            // computed_by NOT NULL safeguard
            throw new \InvalidArgumentException('actorStaffId must be positive (computed_by NOT NULL).');
        }

        // Get existing row (single row per sample)
        $existing = ReagentCalculation::query()
            ->where('sample_id', $sampleId)
            ->first();

        $oldSummary = $existing ? $this->summarizePayload($existing->payload) : null;

        // If locked, do not overwrite computation content (but we still may update trace/audit lightly if desired).
        // We'll respect locked hard: return as-is.
        if ($existing && (bool) $existing->locked === true) {
            // Still write a small audit that recompute was requested but skipped.
            $this->writeAudit(
                staffId: $actorStaffId,
                calcId: (int) $existing->calc_id,
                action: 'REAGENT_CALC_RECOMPUTE_SKIPPED_LOCKED',
                oldValues: $oldSummary,
                newValues: array_merge((array) $oldSummary, [
                    'trigger' => $trigger,
                    'skipped_reason' => 'locked',
                ])
            );
            return $existing;
        }

        // Compute new payload (memory-safe queries; avoid loading huge collections)
        $payload = $this->computePayloadForSample($sampleId, $trigger, $actorStaffId, $ref);

        // Upsert row
        $now = now();
        $data = [
            'sample_id'    => $sampleId,
            'computed_by'  => $actorStaffId,
            'edited_by'    => $actorStaffId,
            'computed_at'  => $now,
            'edited_at'    => $now,
            'locked'       => false,
            'version_no'   => (int) ($existing?->version_no ?? 0) + 1,
            'payload'      => $payload,
        ];

        // Some columns might not exist across environments; guard them
        $data = $this->onlyExistingColumns('reagent_calculations', $data);

        $calc = DB::transaction(function () use ($existing, $data, $sampleId) {
            if ($existing) {
                $existing->fill($data);
                $existing->save();

                return $existing;
            }

            return ReagentCalculation::query()->create($data);
        });

        // Audit (ringkas)
        $newSummary = $this->summarizePayload($payload);

        $this->writeAudit(
            staffId: $actorStaffId,
            calcId: (int) $calc->calc_id,
            action: 'REAGENT_CALC_RECOMPUTED',
            oldValues: $oldSummary,
            newValues: $newSummary
        );

        return $calc;
    }

    /**
     * Step 7 core:
     * - skip cancelled sample_tests
     * - repeats_count from version_no > 1
     * - bounded trace
     * - compact state
     */
    private function computePayloadForSample(
        int $sampleId,
        string $trigger,
        int $actorStaffId,
        array $ref = []
    ): array {
        $nowIso = now()->toIso8601String();

        // Count cancelled vs active (memory-safe)
        $cancelledCount = SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where('status', 'cancelled')
            ->count();

        // Active sample_tests: exclude cancelled
        $activeSampleTestIds = SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where('status', '!=', 'cancelled')
            ->pluck('sample_test_id')
            ->map(fn($v) => (int) $v)
            ->values()
            ->all();

        $activeCount = count($activeSampleTestIds);

        // Repeat count: how many results have version_no > 1 for active tests (DB count only)
        $repeatsCount = 0;
        if ($activeCount > 0) {
            $repeatsCount = TestResult::query()
                ->whereIn('sample_test_id', $activeSampleTestIds)
                ->where('version_no', '>', 1)
                ->count();
        }

        // ---- Optional: hook into formula engine if present (defensive) ----
        // We keep this memory-safe: only compute minimal placeholder until rules engine exists/returns items.
        $items = [];
        $missing = [];
        $state = 'baseline';

        // If you already have engine classes, we try to use them. If not available, fallback to missing_rules.
        // We avoid hard "use" to prevent fatal if classes are absent.
        $resolverClass = '\\App\\Services\\ReagentCalcRuleResolver';
        $evaluatorClass = '\\App\\Services\\ReagentCalcFormulaEvaluator';

        if ($activeCount === 0) {
            // If everything cancelled or no tests yet
            $state = ($trigger === 'cancelled') ? 'cancelled' : 'baseline';
        } elseif (class_exists($resolverClass) && class_exists($evaluatorClass)) {
            try {
                $resolver = app($resolverClass);
                $evaluator = app($evaluatorClass);

                // Pull minimal data needed for rules (avoid loading relations)
                $tests = SampleTest::query()
                    ->select(['sample_test_id', 'parameter_id', 'method_id'])
                    ->whereIn('sample_test_id', $activeSampleTestIds)
                    ->get();

                foreach ($tests as $t) {
                    $parameterId = (int) $t->parameter_id;
                    $methodId = $t->method_id !== null ? (int) $t->method_id : null;

                    // Try common resolver method names defensively
                    $rule = null;
                    if (method_exists($resolver, 'resolveFor')) {
                        $rule = $resolver->resolveFor($parameterId, $methodId);
                    } elseif (method_exists($resolver, 'resolve')) {
                        $rule = $resolver->resolve($parameterId, $methodId);
                    } elseif (method_exists($resolver, 'resolveForSampleTest')) {
                        $rule = $resolver->resolveForSampleTest($t);
                    }

                    if (!$rule) {
                        $missing[] = [
                            'parameter_id' => $parameterId,
                            'method_id' => $methodId,
                            'reason' => 'rule_not_found',
                        ];
                        continue;
                    }

                    // Evaluate formula (defensively)
                    $computed = null;
                    if (method_exists($evaluator, 'evaluate')) {
                        $computed = $evaluator->evaluate($rule, [
                            'sample_id' => $sampleId,
                            'sample_test_id' => (int) $t->sample_test_id,
                        ]);
                    } elseif (method_exists($evaluator, 'compute')) {
                        $computed = $evaluator->compute($rule, [
                            'sample_id' => $sampleId,
                            'sample_test_id' => (int) $t->sample_test_id,
                        ]);
                    }

                    if (is_array($computed)) {
                        // evaluator can return a single item or list
                        $isList = array_is_list($computed);
                        if ($isList) {
                            foreach ($computed as $row) {
                                if (is_array($row)) $items[] = $row;
                            }
                        } else {
                            $items[] = $computed;
                        }
                    }
                }

                if (!empty($missing)) {
                    $state = 'missing_rules';
                } else {
                    // If trigger is updated/created/rerun we consider adjusted
                    $state = in_array($trigger, ['updated', 'created', 'rerun'], true) ? 'adjusted' : 'baseline';
                }
            } catch (\Throwable $e) {
                // If engine fails, keep safe fallback
                $items = [];
                $missing = [
                    ['reason' => 'engine_error', 'message' => $e->getMessage()],
                ];
                $state = 'missing_rules';
            }
        } else {
            // No engine classes found yet
            $missing = [
                ['reason' => 'engine_not_ready'],
            ];
            $state = 'missing_rules';
        }

        // Summary aggregation (keep lightweight)
        $itemsCount = is_array($items) ? count($items) : 0;

        // Estimate total volume (if your items include volume_uL)
        $totalVol = 0;
        foreach ($items as $it) {
            if (is_array($it) && isset($it['volume_uL']) && is_numeric($it['volume_uL'])) {
                $totalVol += (float) $it['volume_uL'];
            }
        }

        $payload = [
            'schema_version' => self::SCHEMA_VERSION,
            'state' => $state,
            'computed_at' => $nowIso,
            'sample_id' => $sampleId,
            'summary' => [
                'active_sample_tests_count' => $activeCount,
                'cancelled_sample_tests_count' => $cancelledCount,
                'items_count' => $itemsCount,
                'total_estimated_volume_uL' => $totalVol,
                'repeats_count' => (int) $repeatsCount,
            ],
            'items' => $items,
            'missing' => $missing,
            'trace' => [],
            'last_event' => [
                'trigger' => $trigger,
                'actor_staff_id' => $actorStaffId,
                'ref' => $ref,
            ],
        ];

        // Add bounded trace entry
        $this->pushTrace($payload, [
            'ts' => $nowIso,
            'event' => $trigger,
            'ref' => $ref,
            'note' => 'reagent calc computed',
        ]);

        return $payload;
    }

    /**
     * Bounded trace helper (anti memory bloat).
     */
    private function pushTrace(array &$payload, array $entry): void
    {
        $trace = $payload['trace'] ?? [];
        if (!is_array($trace)) {
            $trace = [];
        }

        $trace[] = $entry;

        $count = count($trace);
        if ($count > self::TRACE_MAX) {
            $trace = array_slice($trace, $count - self::TRACE_MAX);
        }

        $payload['trace'] = $trace;
    }

    /**
     * Audit log (ringkas). Jangan simpan payload full.
     */
    private function writeAudit(
        int $staffId,
        int $calcId,
        string $action,
        ?array $oldValues,
        ?array $newValues
    ): void {
        try {
            AuditLog::query()->create($this->onlyExistingColumns('audit_logs', [
                'staff_id' => $staffId,
                'entity_name' => 'reagent_calculation',
                'entity_id' => $calcId,
                'action' => $action,
                'timestamp' => now(),
                'ip_address' => request()?->ip(),
                'old_values' => $oldValues,
                'new_values' => $newValues,
            ]));
        } catch (\Throwable $e) {
            // do not break main flow
            logger()->warning('AuditLog write failed (reagent calc): ' . $e->getMessage());
        }
    }

    /**
     * Summarize payload to keep audit snapshots lightweight.
     */
    private function summarizePayload($payload): ?array
    {
        if (!is_array($payload)) {
            return null;
        }

        $summary = $payload['summary'] ?? null;

        return [
            'schema_version' => $payload['schema_version'] ?? null,
            'state' => $payload['state'] ?? null,
            'sample_id' => $payload['sample_id'] ?? null,
            'computed_at' => $payload['computed_at'] ?? null,
            'trigger' => $payload['last_event']['trigger'] ?? null,
            'items_count' => is_array($summary) ? ($summary['items_count'] ?? null) : null,
            'repeats_count' => is_array($summary) ? ($summary['repeats_count'] ?? null) : null,
            'active_sample_tests_count' => is_array($summary) ? ($summary['active_sample_tests_count'] ?? null) : null,
            'cancelled_sample_tests_count' => is_array($summary) ? ($summary['cancelled_sample_tests_count'] ?? null) : null,
        ];
    }

    /**
     * Only keep keys that exist as columns (helps compatibility across migrations).
     */
    private function onlyExistingColumns(string $table, array $data): array
    {
        try {
            $cols = Schema::getColumnListing($table);
            $cols = array_flip($cols);

            return array_filter(
                $data,
                fn($v, $k) => isset($cols[$k]),
                ARRAY_FILTER_USE_BOTH
            );
        } catch (\Throwable $e) {
            // If schema introspection fails, return original
            return $data;
        }
    }
}