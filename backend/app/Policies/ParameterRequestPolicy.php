<?php

namespace App\Policies;

use App\Models\Staff;

class ParameterRequestPolicy
{
    private function roleName(Staff $user): ?string
    {
        return $user->role?->name;
    }

    /**
     * Step 3: visible to all staff except Sample Collector.
     */
    public function viewAny(Staff $user): bool
    {
        $role = (string) ($this->roleName($user) ?? '');
        if ($role === '') return false;

        return $role !== 'Sample Collector';
    }

    /**
     * Step 2: Only Administrator + Analyst can submit parameter requests.
     */
    public function create(Staff $user): bool
    {
        return in_array($this->roleName($user), [
            'Administrator',
            'Analyst',
        ], true);
    }
}