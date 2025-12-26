<?php

namespace App\Policies;

use App\Models\SampleRequest;
use App\Models\Staff;
use App\Models\Client;

class SampleRequestPolicy
{
    // Role IDs (sesuai mapping FE kamu)
    private const ROLE_ADMIN = 2;
    private const ROLE_SAMPLE_COLLECTOR = 3;
    private const ROLE_ANALYST = 4;
    private const ROLE_OM = 5;
    private const ROLE_LAB_HEAD = 6;

    private function isStaff($user): bool
    {
        return $user instanceof Staff;
    }

    private function isClient($user): bool
    {
        return $user instanceof Client;
    }

    private function staffRoleId(Staff $staff): ?int
    {
        return $staff->role_id ?? null;
    }

    private function staffHasRole(Staff $staff, array $roleIds): bool
    {
        $rid = $this->staffRoleId($staff);
        return $rid !== null && in_array($rid, $roleIds, true);
    }

    /**
     * List / queue.
     * - Staff boleh lihat queue
     * - Client boleh lihat list miliknya (controller tetap harus scope by client_id)
     */
    public function viewAny($user): bool
    {
        if ($this->isStaff($user)) {
            return $this->staffHasRole($user, [
                self::ROLE_ADMIN,
                self::ROLE_SAMPLE_COLLECTOR,
                self::ROLE_ANALYST,
                self::ROLE_OM,
                self::ROLE_LAB_HEAD,
            ]);
        }

        if ($this->isClient($user)) {
            return true;
        }

        return false;
    }

    /**
     * Detail 1 request
     * - Client hanya request miliknya
     * - Staff boleh semua (kalau mau lebih ketat, bisa dibatasi role tertentu)
     */
    public function view($user, SampleRequest $request): bool
    {
        if ($this->isClient($user)) {
            return (int) $request->client_id === (int) $user->client_id;
        }

        if ($this->isStaff($user)) {
            return $this->staffHasRole($user, [
                self::ROLE_ADMIN,
                self::ROLE_SAMPLE_COLLECTOR,
                self::ROLE_ANALYST,
                self::ROLE_OM,
                self::ROLE_LAB_HEAD,
            ]);
        }

        return false;
    }

    /**
     * Create request: hanya Client (portal)
     */
    public function create($user): bool
    {
        return $this->isClient($user);
    }

    /**
     * Update status (approve/reject/review): minimal Admin / Lab Head
     */
    public function updateStatus($user, SampleRequest $request): bool
    {
        if (! $this->isStaff($user)) return false;

        return $this->staffHasRole($user, [
            self::ROLE_ADMIN,
            self::ROLE_LAB_HEAD,
        ]);
    }

    /**
     * Handover admin → sample collector
     */
    public function handover($user, SampleRequest $request): bool
    {
        if (! $this->isStaff($user)) return false;

        return $this->staffHasRole($user, [
            self::ROLE_ADMIN,
        ]);
    }

    /**
     * Intake check (PASS/FAIL) + convert to sample
     */
    public function intake($user, SampleRequest $request): bool
    {
        if (! $this->isStaff($user)) return false;

        return $this->staffHasRole($user, [
            self::ROLE_SAMPLE_COLLECTOR,
            self::ROLE_ADMIN, // optional: kalau admin juga boleh bantu intake
        ]);
    }
}
