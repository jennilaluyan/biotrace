<?php

namespace App\Services;

use App\Events\TestResultSubmitted;
use App\Models\AuditLog;
use App\Models\ReagentCalculation;
use App\Models\TestResult;
use Illuminate\Support\Facades\DB;

class ReagentCalcService
{
    public function upsertFromEvent(TestResultSubmitted $event): ReagentCalculation
    {
        return DB::transaction(function () use ($event) {
            // lock row by sample_id (idempotent & race-safe)
            $calc = ReagentCalculation::query()
                ->where('sample_id', $event->sampleId)
                ->lockForUpdate()
                ->first();

            $created = false;
            if (!$calc) {
                $calc = new ReagentCalculation();
                $calc->sample_id = $event->sampleId;
                $created = true;
            }

            // kalau sudah locked (mis. setelah OM approve nanti), jangan dihitung ulang
            if ((bool) $calc->locked === true) {
                return $calc;
            }

            $now = now();

            $result = TestResult::query()
                ->select(['result_id', 'sample_test_id', 'value_raw', 'value_final', 'unit_id', 'flags', 'updated_at'])
                ->where('result_id', $event->testResultId)
                ->first();

            $payload = is_array($calc->payload) ? $calc->payload : [];

            $payload['schema_version'] = 1;
            $payload['last_event'] = [
                'trigger'        => $event->trigger, // "created" | "updated"
                'test_result_id'  => $event->testResultId,
                'sample_test_id'  => $event->sampleTestId,
                'sample_id'       => $event->sampleId,
                'actor_staff_id'  => $event->actorStaffId,
                'received_at'     => $now->toIso8601String(),
            ];

            if ($result) {
                $payload['last_event']['result_snapshot'] = [
                    'value_raw'   => $result->value_raw,
                    'value_final' => $result->value_final,
                    'unit_id'     => $result->unit_id,
                    'flags'       => $result->flags,
                    'updated_at'  => optional($result->updated_at)->toIso8601String(),
                ];
            }

            // tempat hasil hitung reagent (step berikutnya kita isi real calc)
            $payload['computed'] = $payload['computed'] ?? [
                'summary' => [
                    'reagents_count' => 0,
                ],
                'reagents' => [],
            ];

            $oldPayload = $created ? null : ($calc->payload ?? null);

            $calc->payload = $payload;
            $calc->computed_by = $event->actorStaffId;
            $calc->edited_by = $event->actorStaffId;
            $calc->computed_at = $now;
            $calc->edited_at = $now;

            $calc->save();

            // audit (ringkas, jangan simpan payload besar full)
            AuditLog::create([
                'staff_id'    => $event->actorStaffId,
                'entity_name' => 'reagent_calculation',
                'entity_id'   => (int) $calc->calc_id,
                'action'      => $created ? 'REAGENT_CALC_CREATED' : 'REAGENT_CALC_UPDATED',
                'timestamp'   => $now,
                'ip_address'  => request()?->ip(),
                'old_values'  => $oldPayload ? ['schema_version' => $oldPayload['schema_version'] ?? null, 'last_event' => $oldPayload['last_event'] ?? null] : null,
                'new_values'  => ['schema_version' => $payload['schema_version'], 'last_event' => $payload['last_event']],
            ]);

            return $calc;
        });
    }
}