<?php

namespace App\Enums;

enum SampleRequestStatus: string
{
    case DRAFT = 'draft';
    case SUBMITTED = 'submitted';
    case RETURNED = 'returned';
    case NEEDS_REVISION = 'needs_revision';
    case READY_FOR_DELIVERY = 'ready_for_delivery';
    case PHYSICALLY_RECEIVED = 'physically_received';
    case IN_TRANSIT_TO_COLLECTOR = 'in_transit_to_collector';
    case UNDER_INSPECTION = 'under_inspection';

        // existing
    case REJECTED = 'rejected';
    case INTAKE_CHECKLIST_PASSED = 'intake_checklist_passed';
    case AWAITING_VERIFICATION = 'awaiting_verification';
    case INTAKE_VALIDATED = 'intake_validated';
    case INSPECTION_FAILED = 'inspection_failed';
    case RETURNED_TO_ADMIN = 'returned_to_admin';


    /** @return string[] */
    public static function values(): array
    {
        return array_map(fn(self $c) => $c->value, self::cases());
    }
}
