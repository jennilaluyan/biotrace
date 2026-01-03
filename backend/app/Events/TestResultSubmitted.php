<?php

namespace App\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;

class TestResultSubmitted implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public int $testResultId,
        public int $sampleTestId,
        public int $sampleId,
        public int $actorStaffId,
        public string $trigger // "created" | "updated"
    ) {}
}