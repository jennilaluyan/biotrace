<?php

namespace App\Enums;

enum SampleRequestStatus: string
{
    case DRAFT = 'draft';
    case SUBMITTED = 'submitted';
    case RETURNED = 'returned';
    case READY_FOR_DELIVERY = 'ready_for_delivery';
    case PHYSICALLY_RECEIVED = 'physically_received';
    case IN_TRANSIT_TO_COLLECTOR = 'in_transit_to_collector';
    case UNDER_INSPECTION = 'under_inspection';
    case INTAKE_CHECKLIST_PASSED = 'intake_checklist_passed';
    case INTAKE_VALIDATED = 'intake_validated';

    case REJECTED = 'rejected';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}