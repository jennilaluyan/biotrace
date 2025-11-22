<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\Staff;

class ClientPolicy
{
    /**
     * Ambil nama role dalam lowercase supaya perbandingan mudah.
     */
    protected function role(Staff $user): string
    {
        return strtolower($user->role->name ?? '');
    }

    /**
     * LH + Admin + OM boleh view list dan detail client.
     */
    protected function canViewAll(Staff $user): bool
    {
        return in_array($this->role($user), [
            'administrator',
            'laboratory head',
            'operational manager',
        ]);
    }

    /**
     * LH + Admin boleh create/update/delete client.
     */
    protected function canManage(Staff $user): bool
    {
        return in_array($this->role($user), [
            'administrator',
            'laboratory head',
        ]);
    }

    // GET /clients
    public function viewAny(Staff $user): bool
    {
        return $this->canViewAll($user);
    }

    // GET /clients/{client}
    public function view(Staff $user, Client $client): bool
    {
        return $this->canViewAll($user);
    }

    // POST /clients
    public function create(Staff $user): bool
    {
        return $this->canManage($user);
    }

    // PUT/PATCH /clients/{client}
    public function update(Staff $user, Client $client): bool
    {
        return $this->canManage($user);
    }

    // DELETE /clients/{client}
    public function delete(Staff $user, Client $client): bool
    {
        return $this->canManage($user);
    }
}
