<?php

namespace App\Support;

use App\Enums\SampleRequestStatus;
use App\Models\Sample;
use App\Models\Staff;

final class SampleRequestStatusTransitions
{
    /**
     * Workflow request/intake sebelum lab workflow.
     *
     * Roles:
     * - Client: nanti via client portal (part 2), untuk sekarang backend staff saja.
     * - Administrator: review, return, mark ready_for_delivery, mark physically_received (received at lab desk)
     * - Sample Collector: checklist pass/fail (bisa trigger returned/rejected)
     * - Laboratory Head: validate intake (trigger lab code generation later step)
     */
    public const ROLE_TRANSITIONS = [
        'Administrator' => [
            'submitted' => ['returned', 'ready_for_delivery'],
            'returned' => ['submitted'],
            'ready_for_delivery' => ['physically_received'],
            'physically_received' => ['in_transit_to_collector'],
        ],

        'Sample Collector' => [
            // setelah diterima fisik & dibawa ke SC, SC isi checklist:
            // PASS -> awaiting_verification
            // FAIL -> inspection_failed (controller checklist yang set)
            'physically_received' => ['in_transit_to_collector', 'rejected'],
            'in_transit_to_collector' => ['under_inspection'],
            'under_inspection' => ['awaiting_verification', 'inspection_failed'],
        ],

        'Operational Manager' => [
            // Step 3 nanti punya endpoint verify, tapi transition map kita siapkan dari sekarang
            'awaiting_verification' => ['intake_validated'],
        ],

        'Laboratory Head' => [
            'awaiting_verification' => ['intake_validated'],
        ],
    ];

    public static function canTransition(Staff $user, Sample $sample, string $target): bool
    {
        $roleName = $user->role?->name;
        if (!$roleName || !isset(self::ROLE_TRANSITIONS[$roleName])) return false;

        $current = (string) $sample->request_status;

        $map = self::ROLE_TRANSITIONS[$roleName];
        if (!isset($map[$current])) return false;

        return in_array($target, $map[$current], true);
    }

    public static function allStatuses(): array
    {
        return SampleRequestStatus::values();
    }
}
