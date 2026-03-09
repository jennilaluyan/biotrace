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
     * - Administrator: Accept/Reject request, mark ready_for_delivery, mark physically_received
     * - Sample Collector: inspection flow
     * - Operational Manager / Laboratory Head: verification & assignment flow
     */
    public const ROLE_TRANSITIONS = [
        'Administrator' => [
            'submitted' => ['ready_for_delivery', 'rejected', 'returned'],
            'returned' => ['submitted'],

            // flow gagal intake dari Sample Collector
            'inspection_failed' => ['returned', 'rejected'],
            'returned_to_admin' => ['returned', 'rejected'],

            'ready_for_delivery' => ['physically_received'],
            'physically_received' => ['in_transit_to_collector'],

            'waiting_sample_id_assignment' => ['intake_validated', 'sample_id_pending_verification'],
            'sample_id_approved_for_assignment' => ['intake_validated'],
        ],

        'Sample Collector' => [
            'physically_received' => ['in_transit_to_collector', 'rejected'],
            'in_transit_to_collector' => ['under_inspection'],
            'under_inspection' => ['awaiting_verification', 'inspection_failed'],
        ],

        'Operational Manager' => [
            'awaiting_verification' => ['intake_validated', 'waiting_sample_id_assignment'],
            'sample_id_pending_verification' => ['sample_id_approved_for_assignment', 'waiting_sample_id_assignment'],
        ],

        'Laboratory Head' => [
            'awaiting_verification' => ['intake_validated', 'waiting_sample_id_assignment'],
            'sample_id_pending_verification' => ['sample_id_approved_for_assignment', 'waiting_sample_id_assignment'],
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