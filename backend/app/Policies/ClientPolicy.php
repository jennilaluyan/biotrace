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

    protected function isAdmin(Staff $user): bool
    {
        return $this->role($user) === 'administrator';
    }

    protected function isOM(Staff $user): bool
    {
        return $this->role($user) === 'operational manager';
    }

    protected function isLabHead(Staff $user): bool
    {
        return $this->role($user) === 'laboratory head';
    }

    protected function isOperator(Staff $user): bool
    {
        return in_array($this->role($user), [
            'analyst',
            'sample collector',
        ]);
    }

    /**
     * Semua staff internal perlu READ data client
     * (operasional, QA monitoring, sample workflow).
     */
    protected function canRead(Staff $user): bool
    {
        return
            $this->isAdmin($user) ||
            $this->isOM($user) ||
            $this->isLabHead($user);
    }

    /**
     * Hanya Administrator boleh CREATE/UPDATE/DELETE (soft delete).
     */
    protected function canManage(Staff $user): bool
    {
        return $this->isAdmin($user);
    }

    // GET /clients
    public function viewAny(Staff $user): bool
    {
        return $this->canRead($user);
    }

    // GET /clients/{client}
    public function view(Staff $user, Client $client): bool
    {
        return $this->canRead($user);
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

    // DELETE /clients/{client} — ALWAYS SOFT DELETE
    public function delete(Staff $user, Client $client): bool
    {
        return $this->canManage($user);
    }
}