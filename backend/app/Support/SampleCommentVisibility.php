<?php

namespace App\Support;

class SampleCommentVisibility
{
    // sesuai tabel roles kamu
    public const ROLE_ID = [
        'CLIENT' => 1,
        'ADMIN' => 2,
        'SAMPLE_COLLECTOR' => 3,
        'ANALYST' => 4,
        'OPERATIONAL_MANAGER' => 5,
        'LAB_HEAD' => 6,
    ];

    public static function visibleRoleIdsForStatus(string $currentStatus): array
    {
        return match ($currentStatus) {
            'received' => [
                // pilih salah satu sesuai keputusan kamu:
                self::ROLE_ID['ADMIN'],
                self::ROLE_ID['SAMPLE_COLLECTOR'],
            ],

            'in_progress' => [
                self::ROLE_ID['ANALYST'],
            ],

            'testing_completed' => [
                self::ROLE_ID['OPERATIONAL_MANAGER'],
            ],

            // status yang dipegang lab head (kalau mau LH juga bisa lihat komentar sendiri)
            'verified', 'validated', 'reported' => [
                self::ROLE_ID['LAB_HEAD'],
            ],

            default => [],
        };
    }
}