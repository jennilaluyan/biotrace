<?php

namespace App\Policies;

use App\Models\Staff;

class ParameterPolicy
{
    private function role(Staff $user): ?string
    {
        return $user->role?->name;
    }

    public function viewAny(Staff $user): bool
    {
        return in_array($this->role($user), [
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
        return $this->role($user) === 'Analyst';
    }

    public function update(Staff $user): bool
    {
        return $this->role($user) === 'Analyst';
    }

    public function delete(Staff $user): bool
    {
        return $this->role($user) === 'Analyst';
    }
}
