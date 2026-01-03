<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ReagentCalculation;
use App\Models\ReagentRule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ReagentCalcService
{
    private const TRACE_LIMIT = 50;
    private const SCHEMA_VERSION = 2;

    /**
     * Baseline record: dibuat ketika sample tests baru dibuat (atau manual).
     */
    public function upsertBaselineForSample(int $sampleId, ?int $actorStaffId): ReagentCalculation
    {
        if (!$actorStaffId || $actorStaffId <= 0) {
            throw new \InvalidArgumentException('actorStaffId is required (computed_by NOT NULL).');
        }

        $now = now();

        return DB::transaction(function () use ($sampleId, $actorStaffId, $now) {
            /** @var ReagentCalculation|null $existing */
            $existing = ReagentCalculation::query()
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->first();

            $basePayload = [
                'schema_version' => self::SCHEMA_VERSION,
                'state'          => 'baseline',
                'computed_at'    => $now->toIso8601String(),
                'sample_id'      => $sampleId,
                'summary'        => [
                    'items_count' => 0,
                    'total_estimated_volume_uL' => 0,
                    'active_sample_tests_count' => 0,
                    'cancelled_sample_tests_count' => 0,
                    'repeats_count' => 0,
                ],
                'items'   => [],
                'missing' => [],
                'trace'   => [
                    [
                        'ts'    => $now->toIso8601String(),
                        'event' => 'baseline',
                        'ref'   => [],
                        'note'  => 'reagent calc baseline created',
                    ],
                ],
                'last_event' => [
                    'trigger'        => 'baseline',
                    'actor_staff_id' => $actorStaffId,
                    'ref'            => [],
                ],
            ];

            if (!$existing) {
                $calc = ReagentCalculation::query()->create([
                    'sample_id'    => $sampleId,
                    'computed_by'  => $actorStaffId,
                    'edited_by'    => $actorStaffId,
                    'locked'       => false,
                    'computed_at'  => $now,
                    'payload'      => $basePayload,
                    'version_no'   => 1,
                ]);

                $this->writeAuditSafe(
                    $actorStaffId,
                    'reagent_calculation',
                    (int) ($calc->calc_id ?? $calc->id ?? 0),
                    'REAGENT_CALC_BASELINE_CREATED',
                    null,
                    [
                        'sample_id' => $sampleId,
                        'state'     => 'baseline',
                        'schema_version' => self::SCHEMA_VERSION,
                    ]
                );

                return $calc;
            }

            // update minimal (jangan timpa payload kalau sudah ada state lain)
            $payload = is_array($existing->payload) ? $existing->payload : [];
            $payload['schema_version'] = $payload['schema_version'] ?? self::SCHEMA_VERSION;
            $payload['sample_id'] = $payload['sample_id'] ?? $sampleId;

            $payload = $this->appendTrace($payload, [
                'ts'    => $now->toIso8601String(),
                'event' => 'baseline_upsert',
                'ref'   => [],
                'note'  => 'baseline upsert requested',
            ]);

            $existing->fill([
                'edited_by'   => $actorStaffId,
                'computed_at' => $now,
                'payload'     => $payload,
            ])->save();

            $this->writeAuditSafe(
                $actorStaffId,
                'reagent_calculation',
                (int) ($existing->calc_id ?? $existing->id ?? 0),
                'REAGENT_CALC_BASELINE_UPSERTED',
                null,
                [
                    'sample_id' => $sampleId,
                    'state'     => $payload['state'] ?? 'unknown',
                    'schema_version' => $payload['schema_version'] ?? null,
                ]
            );

            return $existing;
        });
    }

    /**
     * Recompute called by listener when test_result created/updated.
     */
    public function recomputeForSample(
        int $sampleId,
        string $trigger, // created|updated|bulk_created|manual
        int $actorStaffId,
        array $ref = []
    ): ?ReagentCalculation {
        if ($sampleId <= 0) return null;

        if ($actorStaffId <= 0) {
            throw new \InvalidArgumentException('actorStaffId is required (computed_by NOT NULL).');
        }

        $now = now();

        return DB::transaction(function () use ($sampleId, $trigger, $actorStaffId, $ref, $now) {
            /** @var ReagentCalculation|null $calc */
            $calc = ReagentCalculation::query()
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->first();

            if (!$calc) {
                // kalau belum ada baseline, bikin baseline dulu
                $calc = $this->upsertBaselineForSample($sampleId, $actorStaffId);
                $calc = ReagentCalculation::query()
                    ->where('sample_id', $sampleId)
                    ->lockForUpdate()
                    ->first();
            }

            if (!$calc) return null;

            // kalau locked, jangan compute ulang (tapi tetap catat audit + trace)
            if ((bool) $calc->locked === true) {
                $payload = is_array($calc->payload) ? $calc->payload : [];
                $payload = $this->appendTrace($payload, [
                    'ts'    => $now->toIso8601String(),
                    'event' => 'skipped_locked',
                    'ref'   => $ref,
                    'note'  => 'recompute skipped because locked=true',
                ]);
                $payload['last_event'] = [
                    'trigger'        => $trigger,
                    'actor_staff_id' => $actorStaffId,
                    'ref'            => $ref,
                ];

                $calc->fill([
                    'edited_by'   => $actorStaffId,
                    'computed_at' => $now,
                    'payload'     => $payload,
                ])->save();

                $this->writeAuditSafe(
                    $actorStaffId,
                    'reagent_calculation',
                    (int) ($calc->calc_id ?? $calc->id ?? 0),
                    'REAGENT_CALC_SKIPPED_LOCKED',
                    null,
                    [
                        'sample_id' => $sampleId,
                        'trigger'   => $trigger,
                        'ref'       => $ref,
                    ]
                );

                return $calc;
            }

            // ===== Step 7: counts + repeats (memory-safe aggregation) =====
            $tests = DB::table('sample_tests')
                ->select(['sample_test_id', 'parameter_id', 'method_id', 'status'])
                ->where('sample_id', $sampleId)
                ->get();

            $activeTests = [];
            $cancelledTests = [];

            // "cancelled" group
            $cancelledStatuses = ['cancelled', 'void', 'rejected'];

            // ✅ Opsi A: "draft" TIDAK ikut dihitung ke reagent calculation
            $excludedFromCompute = array_merge($cancelledStatuses, ['draft']);

            foreach ($tests as $t) {
                $status = (string) ($t->status ?? '');

                if (in_array($status, $cancelledStatuses, true)) {
                    $cancelledTests[] = $t;
                    continue;
                }

                if (in_array($status, $excludedFromCompute, true)) {
                    continue;
                }

                $activeTests[] = $t;
            }

            $activeCount = count($activeTests);
            $cancelledCount = count($cancelledTests);

            // repeats_count = sum(max(version_no)-1) per sample_test_id (active only)
            $repeatsCount = 0;

            if ($activeCount > 0) {
                $ids = array_map(fn($x) => (int) $x->sample_test_id, $activeTests);

                foreach (array_chunk($ids, 500) as $chunk) {
                    $rows = DB::table('test_results')
                        ->select(['sample_test_id', DB::raw('MAX(version_no) as max_version')])
                        ->whereIn('sample_test_id', $chunk)
                        ->groupBy('sample_test_id')
                        ->get();

                    foreach ($rows as $r) {
                        $maxV = (int) ($r->max_version ?? 1);
                        if ($maxV > 1) $repeatsCount += ($maxV - 1);
                    }
                }
            }

            // ===== Step 8: resolve rules + evaluator skeleton =====
            $pairs = [];
            foreach ($activeTests as $t) {
                $pairs[] = [
                    'parameter_id' => (int) $t->parameter_id,
                    'method_id'    => $t->method_id !== null ? (int) $t->method_id : null,
                ];
            }

            $rulesMap = $this->resolveActiveRules($pairs);

            [$itemsAgg, $missingRules] = $this->computeReagentsFromRules(
                $activeTests,
                $rulesMap,
                [
                    'repeats_count' => $repeatsCount,
                    'active_count'  => $activeCount,
                ]
            );

            $itemsCount = count($itemsAgg);
            $totalVol = 0;
            foreach ($itemsAgg as $it) {
                $totalVol += (int) ($it['estimated_volume_uL'] ?? 0);
            }

            // kalau activeCount=0 -> computed (empty), bukan missing_rules
            $state = 'computed';
            if ($activeCount > 0 && !empty($missingRules)) {
                $state = 'missing_rules';
            }

            $payload = is_array($calc->payload) ? $calc->payload : [];
            $payload['schema_version'] = self::SCHEMA_VERSION;
            $payload['state'] = $state;
            $payload['computed_at'] = $now->toIso8601String();
            $payload['sample_id'] = $sampleId;

            $payload['summary'] = [
                'items_count' => $itemsCount,
                'total_estimated_volume_uL' => $totalVol,
                'active_sample_tests_count' => $activeCount,
                'cancelled_sample_tests_count' => $cancelledCount,
                'repeats_count' => $repeatsCount,
            ];

            $payload['items'] = array_values($itemsAgg);
            $payload['missing'] = $missingRules;

            $payload = $this->appendTrace($payload, [
                'ts'    => $now->toIso8601String(),
                'event' => 'recompute',
                'ref'   => $ref,
                'note'  => $state === 'computed'
                    ? 'reagent calc recomputed'
                    : 'reagent calc recomputed but missing rules',
            ]);

            $payload['last_event'] = [
                'trigger'        => $trigger,
                'actor_staff_id' => $actorStaffId,
                'ref'            => $ref,
            ];

            $oldSummary = null;
            if (is_array($calc->payload) && isset($calc->payload['summary'])) {
                $oldSummary = $calc->payload['summary'];
            }

            $calc->fill([
                'computed_by' => $calc->computed_by ?: $actorStaffId,
                'edited_by'   => $actorStaffId,
                'computed_at' => $now,
                'payload'     => $payload,
                'version_no'  => (int) ($calc->version_no ?? 1),
            ])->save();

            $this->writeAuditSafe(
                $actorStaffId,
                'reagent_calculation',
                (int) ($calc->calc_id ?? $calc->id ?? 0),
                'REAGENT_CALC_RECOMPUTED',
                ['summary' => $oldSummary],
                [
                    'sample_id' => $sampleId,
                    'trigger'   => $trigger,
                    'ref'       => $ref,
                    'state'     => $state,
                    'summary'   => $payload['summary'],
                    'missing_rules_count' => count($missingRules),
                ]
            );

            return $calc;
        });
    }

    /**
     * Resolve active rules for (parameter_id, method_id) pairs.
     * Priority: exact match pid|mid, then fallback pid|0 (method null rule).
     */
    private function resolveActiveRules(array $pairs): array
    {
        $paramIds = [];
        foreach ($pairs as $p) {
            $pid = (int) ($p['parameter_id'] ?? 0);
            if ($pid > 0) $paramIds[$pid] = true;
        }
        $paramIds = array_keys($paramIds);

        if (empty($paramIds)) return [];

        $rules = ReagentRule::query()
            ->select(['rule_id', 'parameter_id', 'method_id', 'version_no', 'formula'])
            ->whereIn('parameter_id', $paramIds)
            ->where('is_active', true)
            ->orderByDesc('version_no')
            ->get();

        $map = [];
        foreach ($rules as $r) {
            $pid = (int) $r->parameter_id;
            $mid = $r->method_id !== null ? (int) $r->method_id : 0;

            $key = $pid . '|' . $mid;

            if (isset($map[$key])) {
                continue;
            }

            // ✅ hardening: formula bisa kebaca array / object / string (json)
            $formula = $r->formula;

            if (is_string($formula)) {
                $decoded = json_decode($formula, true);
                $formula = is_array($decoded) ? $decoded : [];
            } elseif (is_object($formula)) {
                $formula = json_decode(json_encode($formula), true);
                if (!is_array($formula)) $formula = [];
            } elseif (!is_array($formula)) {
                $formula = [];
            }

            $map[$key] = $formula;
        }

        return $map;
    }

    /**
     * Skeleton evaluator:
     * - kalau rule belum ada → missing_rules
     * - kalau ada → agregasi reagents[uL_per_run] × run_count
     */
    private function computeReagentsFromRules(array $activeTests, array $rulesMap, array $ctx): array
    {
        $missing = [];
        $agg = [];

        $repeatsCount = (int) ($ctx['repeats_count'] ?? 0);

        foreach ($activeTests as $t) {
            $pid = (int) ($t->parameter_id ?? 0);
            $mid = $t->method_id !== null ? (int) $t->method_id : 0;

            if ($pid <= 0) continue;

            $keyExact = $pid . '|' . $mid;
            $keyFallback = $pid . '|0';

            $rule = $rulesMap[$keyExact] ?? ($rulesMap[$keyFallback] ?? null);

            if (!$rule) {
                $missing[] = [
                    'parameter_id' => $pid,
                    'method_id'    => $mid !== 0 ? $mid : null,
                    'reason'       => 'rule_not_found',
                ];
                continue;
            }

            $type = (string) ($rule['type'] ?? 'simple_v1');

            $dilution = (float) ($rule['dilution_factor'] ?? 1);
            if ($dilution <= 0) $dilution = 1;

            $qcRuns = (int) ($rule['qc_runs'] ?? 0);
            $blankRuns = (int) ($rule['blank_runs'] ?? 0);

            $runCount = 1 + max(0, $qcRuns) + max(0, $blankRuns);

            // distribusi sederhana dulu
            if ($repeatsCount > 0) {
                $runCount += 1;
            }

            $reagents = is_array($rule['reagents'] ?? null) ? $rule['reagents'] : [];

            if (empty($reagents)) {
                $missing[] = [
                    'parameter_id' => $pid,
                    'method_id'    => $mid !== 0 ? $mid : null,
                    'reason'       => 'rule_missing_reagents',
                    'rule_type'    => $type,
                ];
                continue;
            }

            foreach ($reagents as $rg) {
                $rid = (int) ($rg['reagent_id'] ?? 0);
                if ($rid <= 0) continue;

                // ✅ hardening: terima uL_per_run atau ul_per_run
                $uLPerRun = $rg['uL_per_run'] ?? ($rg['ul_per_run'] ?? null);
                $uLPerRun = (float) ($uLPerRun ?? 0);

                if ($uLPerRun <= 0) continue;

                $estimated = (int) round($uLPerRun * $runCount * $dilution);

                if (!isset($agg[$rid])) {
                    $agg[$rid] = [
                        'reagent_id' => $rid,
                        'estimated_volume_uL' => 0,
                        'sources' => [],
                    ];
                }

                $agg[$rid]['estimated_volume_uL'] += $estimated;

                if (count($agg[$rid]['sources']) < 10) {
                    $agg[$rid]['sources'][] = [
                        'parameter_id' => $pid,
                        'method_id'    => $mid !== 0 ? $mid : null,
                        'uL_per_run'   => $uLPerRun,
                        'run_count'    => $runCount,
                        'dilution_factor' => $dilution,
                    ];
                }
            }
        }

        return [$agg, $missing];
    }

    private function appendTrace(array $payload, array $entry): array
    {
        $trace = [];

        if (isset($payload['trace']) && is_array($payload['trace'])) {
            $trace = $payload['trace'];
        }

        $trace[] = $entry;

        if (count($trace) > self::TRACE_LIMIT) {
            $trace = array_slice($trace, -self::TRACE_LIMIT);
        }

        $payload['trace'] = $trace;

        return $payload;
    }

    private function writeAuditSafe(
        int $staffId,
        string $entityName,
        int $entityId,
        string $action,
        $oldValues,
        $newValues
    ): void {
        try {
            AuditLog::create([
                'staff_id'    => $staffId,
                'entity_name' => $entityName,
                'entity_id'   => $entityId,
                'action'      => $action,
                'timestamp'   => now(),
                'ip_address'  => request()?->ip(),
                'old_values'  => $oldValues,
                'new_values'  => $newValues,
            ]);
        } catch (\Throwable $e) {
            Log::warning('AuditLog write failed (reagent calc): ' . $e->getMessage());
        }
    }
}