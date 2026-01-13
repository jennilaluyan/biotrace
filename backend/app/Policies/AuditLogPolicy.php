<?php

namespace App\Policies;

use App\Models\AuditLog;
use App\Models\Staff;

class AuditLogPolicy
{
    /**
     * Only Operational Manager & Lab Head can view audit logs.
     */
    public function viewAny(Staff $staff): bool
    {
        if (!$staff->relationLoaded('role')) {
            $staff->load('role');
        }

        if (!$staff->role) {
            return false;
        }

        return in_array($staff->role->name, [
            'Operational Manager',
            'Lab Head',
        ], true);
    }
}
