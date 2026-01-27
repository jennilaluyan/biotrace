<?php

namespace App\Policies;

use App\Models\AuditLog;
use App\Models\Staff;

class AuditLogPolicy
{
    /**
     * Audit logs adalah data sensitif ISO 17025.
     *
     * HANYA:
     * - Operational Manager
     * - Laboratory Head
     */
    public function viewAny(Staff $user): bool
    {
        return in_array($user->role?->name, [
            'Administrator',
            'Sample Collector',
            'Analyst',
            'Operational Manager',
            'Laboratory Head',
        ], true);
    }

    /**
     * Detail audit log mengikuti aturan yang sama.
     */
    public function view(Staff $staff, AuditLog $log): bool
    {
        return $this->viewAny($staff);
    }
}