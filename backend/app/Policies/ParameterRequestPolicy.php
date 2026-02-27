<?php

namespace App\Policies;

use App\Models\Staff;

class ParameterRequestPolicy
{
    private function roleName(Staff $user): ?string
    {
        return $user->role?->name;
    }

    public function viewAny(Staff $user): bool
    {
        $role = (string) ($this->roleName($user) ?? '');
        if ($role === '') return false;

        return $role !== 'Sample Collector';
    }

    public function create(Staff $user): bool
    {
        return in_array($this->roleName($user), [
            'Administrator',
            'Analyst',
        ], true);
    }
    public function approve(Staff $user): bool
    {
        return in_array($this->roleName($user), [
            'Operational Manager',
            'Laboratory Head',
        ], true);
    }
}