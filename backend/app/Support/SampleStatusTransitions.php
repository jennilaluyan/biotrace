<?php

namespace App\Support;

use App\Models\Sample;
use App\Models\Staff;
use App\Enums\SampleStatus;

class SampleStatusTransitions
{
    /**
     * Daftar transition yang diizinkan per role name.
     *
     * Format:
     *  'RoleName' => [
     *      'from_status' => ['to_status1', 'to_status2'],
     *  ]
     */
    public const ROLE_TRANSITIONS = [
        // Administrator / front office / sample receiving
        'Administrator' => [
            'submitted' => ['ready_for_delivery', 'rejected'],
            'returned' => ['submitted'],

            'inspection_failed' => ['returned', 'rejected'],
            'returned_to_admin' => ['returned', 'rejected'],

            'ready_for_delivery' => ['physically_received'],
            'physically_received' => ['in_transit_to_collector'],

            'waiting_sample_id_assignment' => ['intake_validated', 'sample_id_pending_verification'],
            'sample_id_approved_for_assignment' => ['intake_validated'],
        ],

        // Petugas penerima sampel
        'Sample Collector' => [
            'received' => ['in_progress'],
        ],

        // Analyst: mengerjakan testing
        'Analyst' => [
            'in_progress' => ['testing_completed'],
        ],

        // Operational Manager: verifikasi hasil uji
        'Operational Manager' => [
            'testing_completed' => ['verified'],
        ],

        // Laboratory Head: final validation & release report
        'Laboratory Head' => [
            'verified'  => ['validated'],
            'validated' => ['reported'],
        ],

        // Role "Client" tidak boleh ubah status sama sekali
    ];

    /**
     * Cek apakah user dengan role tertentu boleh melakukan transition ini.
     */
    public static function canTransition(Staff $user, Sample $sample, string $targetStatus): bool
    {
        $roleName = $user->role?->name;
        $current  = $sample->current_status;

        if (!$roleName || !isset(self::ROLE_TRANSITIONS[$roleName])) {
            return false;
        }

        $allowedFrom = self::ROLE_TRANSITIONS[$roleName];

        if (!isset($allowedFrom[$current])) {
            return false;
        }

        return in_array($targetStatus, $allowedFrom[$current], true);
    }

    /**
     * Daftar semua status detail yang valid.
     * Sinkron dengan CHECK constraint di migration `samples`.
     */
    public static function allStatuses(): array
    {
        return SampleStatus::values();
    }
}
