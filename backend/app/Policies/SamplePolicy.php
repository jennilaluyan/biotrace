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
            // kalau mau tambahkan:
            // 'Laboratory Head',
        ]);
    }

    // Nanti kalau ada fitur edit / delete sample, aturan ditambah di sini:
    // public function update(Staff $user, Sample $sample): bool {...}
    // public function delete(Staff $user, Sample $sample): bool {...}
}
