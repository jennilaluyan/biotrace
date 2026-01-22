<?php

namespace App\Enums;

enum SampleRequestStatus: string
{
    case DRAFT = 'draft';
    case SUBMITTED = 'submitted';
    case RETURNED = 'returned';
    case READY_FOR_DELIVERY = 'ready_for_delivery';
    case PHYSICALLY_RECEIVED = 'physically_received';
    case REJECTED = 'rejected';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
