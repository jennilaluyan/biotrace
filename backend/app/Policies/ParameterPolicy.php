<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\Parameter;
use App\Models\Staff;

class ParameterPolicy
{
    private function role(Staff $user): ?string
    {
        return $user->role?->name;
    }

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

    public function view(Staff|Client $user, Parameter $parameter): bool
    {
        if ($user instanceof Client) return true;

        return $this->viewAny($user);
    }

    public function create(Staff|Client $user): bool
    {
        if ($user instanceof Client) return false;

        return in_array($this->role($user), [
            'Administrator',
            'Analyst',
        ], true);
    }

    public function update(Staff|Client $user, Parameter $parameter): bool
    {
        if ($user instanceof Client) return false;

        return in_array($this->role($user), [
            'Administrator',
            'Analyst',
        ], true);
    }

    public function delete(Staff|Client $user, Parameter $parameter): bool
    {
        if ($user instanceof Client) return false;

        return in_array($this->role($user), [
            'Administrator',
            'Analyst',
        ], true);
    }
}
