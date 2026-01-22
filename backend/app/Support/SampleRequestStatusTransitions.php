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
            'returned' => ['submitted'], // setelah client revisi & resubmit (nanti part 2)
            'ready_for_delivery' => ['physically_received'],
        ],

        'Sample Collector' => [
            'physically_received' => ['rejected', 'submitted'],
            // NOTE: kita pakai 'submitted' di sini sebagai "submitted to lab head for validation"
            // biar tidak nambah status baru dulu. Nanti kalau kamu mau lebih jelas:
            // buat status 'collector_submitted' / 'pending_lh_validation'
        ],

        'Laboratory Head' => [
            'submitted' => ['physically_received'],
            // NOTE: placeholder. Nanti step 2.5 kita ubah:
            // LH validate -> tetap physically_received tapi sekaligus generate lab_sample_code + LoA
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
