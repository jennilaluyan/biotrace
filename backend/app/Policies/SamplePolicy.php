<?php

namespace App\Policies;

use App\Models\Sample;
use App\Models\Staff;

class SamplePolicy
{
    /**
     * Helper: cek berdasarkan NAMA role (sesuai tabel roles.name).
     *
     * Contoh isi name di DB:
     * - Client
     * - Administrator
     * - Sample Collector
     * - Analyst
     * - Operational Manager
     * - Laboratory Head
     */
    protected function hasRoleName(Staff $user, array $allowed): bool
    {
        $name = $user->role?->name;

        if (!$name) {
            return false;
        }

        return in_array($name, $allowed, true);
    }

    /**
     * Siapa boleh lihat daftar sample (GET /samples).
     * Semua staf lab internal boleh: Admin, LH, OM, Analyst, Sample Collector.
     * Role "Client" tidak boleh.
     */
    public function viewAny(Staff $user): bool
    {
        return $this->hasRoleName($user, [
            'Administrator',
            'Laboratory Head',
            'Operational Manager',
            'Analyst',
            'Sample Collector',
        ]);
    }

    /**
     * Siapa boleh lihat 1 sample (GET /samples/{sample}).
     */
    public function view(Staff $user, Sample $sample): bool
    {
        return $this->viewAny($user);
    }

    /**
     * Siapa boleh register sample baru (POST /samples).
     * Di sini kita batasi ke Administrator saja
     * (front office yang input Formulir Permintaan Pengujian).
     */
    public function create(Staff $user): bool
    {
        return $this->hasRoleName($user, [
            'Administrator',
            'Laboratory Head',
        ]);
    }
    public function overrideAssigneeOnCreate(Staff $user): bool
    {
        return $this->hasRoleName($user, [
            'Laboratory Head'
        ]);
    }

    public function updateRequestStatus(Staff $user, Sample $sample, string $targetStatus): bool
    {
        // Yang boleh mengubah request_status:
        // - Administrator (review + mark ready/received)
        // - Sample Collector (checklist pass/fail)
        // - Laboratory Head (validate intake; step berikutnya)
        return $this->hasRoleName($user, [
            'Administrator',
            'Sample Collector',
            'Laboratory Head',
        ]);
    }

    public function update(Staff $user, Sample $sample): bool
    {
        // Untuk lulus RBACTest: admin boleh, analyst tidak boleh
        return $this->hasRoleName($user, [
            'Administrator',
            'Laboratory Head', // optional; kalau mau ketat, hapus ini
        ]);
    }
}
