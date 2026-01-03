<?php

namespace App\Listeners;

use App\Events\TestResultSubmitted;
use App\Services\ReagentCalcService;
use Illuminate\Support\Facades\Log;

class TriggerReagentCalcOnTestResultSubmitted
{
    public function __construct(private readonly ReagentCalcService $service) {}

    public function handle(TestResultSubmitted $event): void
    {
        try {
            $this->service->upsertFromEvent($event);
        } catch (\Throwable $e) {
            // jangan bikin API error / jangan bikin memory spike
            Log::warning('Reagent calc failed: ' . $e->getMessage(), [
                'sample_id' => $event->sampleId,
                'sample_test_id' => $event->sampleTestId,
                'test_result_id' => $event->testResultId,
            ]);
        }
    }
}