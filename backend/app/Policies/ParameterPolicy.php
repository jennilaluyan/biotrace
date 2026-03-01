<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\Staff;

class ParameterPolicy
{
    /**
     * Keep staff role lookup only for Staff.
     */
    private function role(Staff $user): ?string
    {
        return $user->role?->name;
    }

    /**
     * Client portal is allowed to list parameters.
     * Staff permissions stay the same as before.
     */
    public function viewAny(Staff|Client $user): bool
    {
        if ($user instanceof Client) return true;

        return in_array($this->role($user), [
            'Administrator',
            'Analyst',
            'Operational Manager',
            'Laboratory Head',
        ], true);
    }

    /**
     * Client portal is allowed to view a parameter.
     * Staff permissions stay the same as before.
     */
    public function view(Staff|Client $user): bool
    {
        if ($user instanceof Client) return true;

        return $this->viewAny($user);
    }

    /**
     * Client portal is NOT allowed to create parameters.
     * Staff permissions stay the same as before.
     */
    public function create(Staff|Client $user): bool
    {
        if ($user instanceof Client) return false;

        return $this->role($user) === 'Analyst';
    }

    /**
     * Client portal is NOT allowed to update parameters.
     * Staff permissions stay the same as before.
     */
    public function update(Staff|Client $user): bool
    {
        if ($user instanceof Client) return false;

        return $this->role($user) === 'Analyst';
    }

    /**
     * Client portal is NOT allowed to delete parameters.
     * Staff permissions stay the same as before.
     */
    public function delete(Staff|Client $user): bool
    {
        if ($user instanceof Client) return false;

        return $this->role($user) === 'Analyst';
    }
}
