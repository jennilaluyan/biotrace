<?php

namespace App\Support;

final class SampleRequestStatus
{
    public const SUBMITTED = 'submitted';
    public const REVIEWED = 'reviewed';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';
    public const CANCELLED = 'cancelled';
    public const HANDED_OVER_TO_COLLECTOR = 'handed_over_to_collector';
    public const INTAKE_PASSED = 'intake_passed';
    public const INTAKE_FAILED = 'intake_failed';
    public const CONVERTED_TO_SAMPLE = 'converted_to_sample';

    public const ALL = [
        self::SUBMITTED,
        self::REVIEWED,
        self::APPROVED,
        self::REJECTED,
        self::CANCELLED,
        self::HANDED_OVER_TO_COLLECTOR,
        self::INTAKE_PASSED,
        self::INTAKE_FAILED,
        self::CONVERTED_TO_SAMPLE,
    ];
}
