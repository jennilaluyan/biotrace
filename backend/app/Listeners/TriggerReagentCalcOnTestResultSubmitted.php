<?php

namespace App\Listeners;

use App\Events\TestResultSubmitted;
use Illuminate\Support\Facades\DB;

class TriggerReagentCalcOnTestResultSubmitted
{
    public function handle(TestResultSubmitted $event): void
    {
        // 1) Cek apakah calc untuk sample ini sudah "locked" (jangan overwrite)
        $existing = DB::table('reagent_calculations')
            ->select('locked')
            ->where('sample_id', $event->sampleId)
            ->first();

        if ($existing && (bool) $existing->locked) {
            // locked = true -> skip (nanti Step 5/6 kita audit "skipped due to locked")
            return;
        }

        // 2) Payload ringkas (summary) - jangan simpan data besar
        $payload = [
            'trigger' => $event->trigger,
            'source' => [
                'test_result_id' => $event->testResultId,
                'sample_test_id' => $event->sampleTestId,
                'sample_id' => $event->sampleId,
            ],
            'meta' => [
                'actor_staff_id' => $event->actorStaffId,
                'computed_at' => now()->toIso8601String(),
                'version' => 1,
            ],
            // placeholder: nanti Step formula engine baru isi computed fields
            'computed' => [
                'status' => 'triggered',
                'items' => [],
            ],
        ];

        $now = now();

        // 3) Upsert by sample_id (idempotent, sesuai unique constraint sample_id)
        DB::table('reagent_calculations')->updateOrInsert(
            ['sample_id' => $event->sampleId],
            [
                'computed_by' => $event->actorStaffId,
                // kalau update, kita set edited_by juga (biar traceable)
                'edited_by'   => $event->trigger === 'updated' ? $event->actorStaffId : null,
                'payload'     => json_encode($payload),
                'locked'      => false,
                'computed_at' => $now,
                'edited_at'   => $event->trigger === 'updated' ? $now : null,
                'updated_at'  => $now,
                'created_at'  => $now, // updateOrInsert akan ignore kalau row sudah ada? (Postgres tetap set value ini saat updateOrInsert update; aman tapi kita bisa refine Step 5 bila perlu)
            ]
        );
    }
}