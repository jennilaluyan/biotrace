<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Role;
use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper: buat role kalau belum ada.
     */
    protected function createRole(string $name): Role
    {
        return Role::firstOrCreate(
            ['name' => $name],
            ['description' => 'Test role ' . $name]
        );
    }

    /**
     * Helper: buat staff.
     */
    protected function createStaff(string $roleName = 'Administrator'): Staff
    {
        $role = $this->createRole($roleName);

        return Staff::create([
            'name'          => 'Audit Tester',
            'email'         => 'audit_' . strtolower(str_replace(' ', '_', $roleName)) . '@example.com',
            'password_hash' => bcrypt('secret123'),
            'role_id'       => $role->role_id,
            'is_active'     => true,
        ]);
    }

    /**
     * Kalau staff_id atau entity_id null → log tidak dibuat (sesuai komentar di AuditLogger).
     */
    public function test_write_does_not_log_when_staff_or_entity_is_null()
    {
        $this->assertDatabaseCount('audit_logs', 0);

        // staff_id null
        AuditLogger::write(
            action: 'TEST_ACTION',
            staffId: null,
            entityName: 'samples',
            entityId: 1,
            oldValues: null,
            newValues: ['foo' => 'bar']
        );

        // entity_id null
        AuditLogger::write(
            action: 'TEST_ACTION',
            staffId: 1,
            entityName: 'samples',
            entityId: null,
            oldValues: null,
            newValues: ['foo' => 'bar']
        );

        // Tetap tidak ada log
        $this->assertDatabaseCount('audit_logs', 0);
    }

    /**
     * write() dengan staff_id & entity_id valid → row audit_logs tercatat.
     */
    public function test_write_creates_audit_log_row_when_all_fields_present()
    {
        $staff = $this->createStaff();

        AuditLogger::write(
            action: 'GENERIC_ACTION',
            staffId: $staff->staff_id,
            entityName: 'staffs',
            entityId: $staff->staff_id,
            oldValues: ['before' => 1],
            newValues: ['after' => 2]
        );

        $this->assertDatabaseHas('audit_logs', [
            'staff_id'    => $staff->staff_id,
            'entity_name' => 'staffs',
            'entity_id'   => $staff->staff_id,
            'action'      => 'GENERIC_ACTION',
        ]);
    }

    /**
     * logSampleRegistered() mencatat SAMPLE_REGISTERED untuk entity "samples".
     */
    public function test_log_sample_registered_creates_audit_log_row()
    {
        $staff = $this->createStaff();

        AuditLogger::logSampleRegistered(
            staffId: $staff->staff_id,
            sampleId: 123,
            clientId: 456,
            newValues: ['dummy' => 'value']
        );

        $this->assertDatabaseHas('audit_logs', [
            'staff_id'    => $staff->staff_id,
            'entity_name' => 'samples',
            'entity_id'   => 123,
            'action'      => 'SAMPLE_REGISTERED',
        ]);
    }

    /**
     * logSampleStatusChanged() mencatat SAMPLE_STATUS_CHANGED dengan old & new status.
     */
    public function test_log_sample_status_changed_creates_audit_log_row()
    {
        $staff = $this->createStaff();

        AuditLogger::logSampleStatusChanged(
            staffId: $staff->staff_id,
            sampleId: 321,
            clientId: 654,
            oldStatus: 'received',
            newStatus: 'in_progress',
            note: 'Move to in_progress'
        );

        $this->assertDatabaseHas('audit_logs', [
            'staff_id'    => $staff->staff_id,
            'entity_name' => 'samples',
            'entity_id'   => 321,
            'action'      => 'SAMPLE_STATUS_CHANGED',
        ]);
    }

    /**
     * Integrasi ringan: LOGIN_SUCCESS dari AuthController harus tercatat di audit_logs.
     * (menggunakan endpoint /api/v1/auth/login)
     */
    public function test_login_success_is_logged_in_audit_logs()
    {
        $staff = $this->createStaff();

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $staff->email,
            'password' => 'secret123',
        ]);

        $response->assertStatus(200);

        $this->assertDatabaseHas('audit_logs', [
            'staff_id'    => $staff->staff_id,
            'entity_name' => 'staffs',
            'entity_id'   => $staff->staff_id,
            'action'      => 'LOGIN_SUCCESS',
        ]);
    }

    /**
     * Integrasi ringan: LOGOUT dari AuthController harus tercatat di audit_logs.
     */
    public function test_logout_is_logged_in_audit_logs()
    {
        $staff = $this->createStaff();

        // Login via token dulu
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email'       => $staff->email,
            'password'    => 'secret123',
            'device_name' => 'Postman',
        ])->assertStatus(200);

        $token = $loginResponse->json('token');

        // Logout
        $this->postJson('/api/v1/auth/logout', [], [
            'Authorization' => 'Bearer ' . $token,
        ])->assertNoContent();

        // Cek audit log
        $this->assertDatabaseHas('audit_logs', [
            'staff_id'    => $staff->staff_id,
            'entity_name' => 'staffs',
            'entity_id'   => $staff->staff_id,
            'action'      => 'LOGOUT',
        ]);
    }
}
