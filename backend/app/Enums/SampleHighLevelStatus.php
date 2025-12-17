<?php

namespace App\Enums;

enum SampleHighLevelStatus: string
{
    case REGISTERED = 'registered';
    case TESTING = 'testing';
    case REPORTED = 'reported';

    /**
     * Mapping dari current_status detail → 3 status high-level.
     *
     * - received → REGISTERED
     * - in_progress, testing_completed, verified, validated → TESTING
     * - reported → REPORTED
     */
    public static function fromCurrentStatus(string $current): self
    {
        return match ($current) {
            'received' => self::REGISTERED,

            'in_progress',
            'testing_completed',
            'verified',
            'validated' => self::TESTING,

            'reported' => self::REPORTED,

            default => throw new \InvalidArgumentException("Unknown sample status: {$current}"),
        };
    }

    public function currentStatuses(): array
    {
        return match ($this) {
            self::REGISTERED => ['received'],
            self::TESTING => [
                'in_progress',
                'testing_completed',
                'verified',
                'validated',
            ],
            self::REPORTED => ['reported'],
        };
    }

    /**
     * Optional: label untuk UI FE
     */
    public function label(): string
    {
        return match ($this) {
            self::REGISTERED => 'Registered',
            self::TESTING => 'Testing',
            self::REPORTED => 'Reported',
        };
    }

    /**
     * Dapatkan semua value enum sebagai array string
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
