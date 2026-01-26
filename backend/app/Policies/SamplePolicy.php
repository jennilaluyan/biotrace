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
     * ✅ Draft request TIDAK boleh dilihat oleh staff/admin (hanya client).
     */
    public function view(Staff $user, Sample $sample): bool
    {
        $isDraftRequest = (($sample->request_status ?? null) === 'draft') && empty($sample->lab_sample_code);
        if ($isDraftRequest) {
            return false;
        }
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
        // ✅ Draft request tidak boleh di-handle staff
        $isDraftRequest = (($sample->request_status ?? null) === 'draft') && empty($sample->lab_sample_code);
        if ($isDraftRequest) {
            return false;
        }

        // Yang boleh mengubah request_status:
        // - Administrator (review + approve + mark physically received + return)
        // - Sample Collector (checklist pass/fail)  (future)
        // - Laboratory Head (validate intake)       (future)
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

    /**
     * Role-based guard for physical workflow actions.
     */
    public function updatePhysicalWorkflow(Staff $user, Sample $sample, string $action): bool
    {
        $role = (string) ($user->role?->name ?? '');
        $adminRoles = ['Administrator', 'Laboratory Head'];
        $collectorRoles = ['Sample Collector'];

        $adminActions = [
            'admin_received_from_client',
            'admin_brought_to_collector',
            'admin_received_from_collector',
            'client_picked_up',
        ];

        $collectorActions = [
            'collector_received',
            'collector_intake_completed',
            'collector_returned_to_admin',
        ];

        if (in_array($action, $adminActions, true)) {
            return in_array($role, $adminRoles, true);
        }

        if (in_array($action, $collectorActions, true)) {
            return in_array($role, $collectorRoles, true);
        }

        return false;
    }
}