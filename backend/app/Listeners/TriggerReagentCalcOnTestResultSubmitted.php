<?php

namespace App\Listeners;

use App\Events\TestResultSubmitted;
use App\Services\ReagentCalcService;

class TriggerReagentCalcOnTestResultSubmitted
{
    public function handle(TestResultSubmitted $event): void
    {
        try {
            $sampleId = (int) ($event->sampleId ?? 0);
            if ($sampleId <= 0) return;

            // actorStaffId wajib (computed_by NOT NULL)
            $actorStaffId = (int) ($event->actorStaffId ?? 0);
            if ($actorStaffId <= 0) {
                throw new \RuntimeException('Missing actorStaffId in TestResultSubmitted event.');
            }

            $trigger = (string) ($event->trigger ?? 'updated');

            app(ReagentCalcService::class)->recomputeForSample(
                $sampleId,
                $trigger, // "created" | "updated"
                $actorStaffId,
                [
                    'test_result_id' => (int) ($event->testResultId ?? 0),
                    'sample_test_id' => (int) ($event->sampleTestId ?? 0),
                ]
            );
        } catch (\Throwable $e) {
            logger()->warning('Reagent recompute failed on TestResultSubmitted', [
                'error' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
        }
    }
}