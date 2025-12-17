<?php

namespace App\Support;

use App\Models\Sample;
use App\Models\Staff;

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
            'received' => ['in_progress'],
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
        return [
            'received',
            'in_progress',
            'testing_completed',
            'verified',
            'validated',
            'reported',
        ];
    }
}
