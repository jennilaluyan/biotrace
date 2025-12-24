<?php

namespace App\Enums;

enum SampleStatus: string
{
    case RECEIVED = 'received';
    case IN_PROGRESS = 'in_progress';
    case TESTING_COMPLETED = 'testing_completed';
    case VERIFIED = 'verified';
    case VALIDATED = 'validated';
    case REPORTED = 'reported';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
