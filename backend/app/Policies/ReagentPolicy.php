<?php

namespace App\Policies;

use App\Models\Staff;

class ReagentPolicy
{
    private function role(Staff $user): ?string
    {
        return $user->role?->name;
    }

    public function viewAny(Staff $user): bool
    {
        return in_array($this->role($user), [
            'Administrator',
            'Sample Collector',
            'Analyst',
            'Operational Manager',
            'Lab Head',
        ], true);
    }

    public function view(Staff $user): bool
    {
        return $this->viewAny($user);
    }

    public function create(Staff $user): bool
    {
        return in_array($this->role($user), ['Administrator', 'Lab Head'], true);
    }

    public function update(Staff $user): bool
    {
        return in_array($this->role($user), ['Administrator', 'Lab Head'], true);
    }

    public function delete(Staff $user): bool
    {
        return in_array($this->role($user), ['Administrator', 'Lab Head'], true);
    }
}
