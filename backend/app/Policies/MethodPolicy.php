<?php

namespace App\Policies;

use App\Models\Method;
use App\Models\Staff;

class MethodPolicy
{
    /**
     * Get role name safely from Staff model.
     * (Supports $staff->role->name or $staff->role_name if exists)
     */
    private function roleName(Staff $staff): ?string
    {
        $name = $staff->role->name ?? ($staff->role_name ?? null);

        return is_string($name) ? trim($name) : null;
    }

    /**
     * Rules:
     * - CRUD: Analyst, Operational Manager
     * - Read-only: Lab Head
     * - No access: Administrator
     */
    public function viewAny(Staff $staff): bool
    {
        $role = $this->roleName($staff);

        return in_array($role, [
            'Analyst',
            'Operational Manager',
            'Lab Head',
        ], true);
    }

    public function view(Staff $staff, Method $method): bool
    {
        return $this->viewAny($staff);
    }

    public function create(Staff $staff): bool
    {
        $role = $this->roleName($staff);

        return in_array($role, [
            'Analyst',
            'Operational Manager',
        ], true);
    }

    public function update(Staff $staff, Method $method): bool
    {
        return $this->create($staff);
    }

    public function delete(Staff $staff, Method $method): bool
    {
        return $this->create($staff);
    }
}
