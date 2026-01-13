<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\AuditLog;
use App\Models\Staff;
use App\Models\Role;
use Laravel\Sanctum\Sanctum;
use Illuminate\Foundation\Testing\RefreshDatabase;

class AuditLogExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_audit_logs_can_be_exported_as_csv(): void
    {
        // --------------------------------
        // Setup role & staff
        // --------------------------------
        $role = Role::create([
            'name' => 'Laboratory Head',
        ]);

        $staff = Staff::factory()->create([
            'role_id' => $role->role_id,
        ]);

        // Sanctum auth
        Sanctum::actingAs($staff);

        // --------------------------------
        // Seed audit logs (TANPA factory)
        // --------------------------------
        AuditLog::create([
            'staff_id'    => $staff->staff_id,
            'action'      => 'LOGIN_SUCCESS',
            'entity_name' => 'auth',
            'entity_id'   => $staff->staff_id,
            'timestamp'   => now(),
        ]);

        AuditLog::create([
            'staff_id'    => $staff->staff_id,
            'action'      => 'LOGOUT',
            'entity_name' => 'auth',
            'entity_id'   => $staff->staff_id,
            'timestamp'   => now(),
        ]);

        // --------------------------------
        // Call export endpoint
        // --------------------------------
        $res = $this->get('/api/v1/audit-logs/export');

        // --------------------------------
        // Assertions (ROBUST & ISO-SAFE)
        // --------------------------------
        $res->assertOk();

        // JANGAN strict match → Laravel auto tambah charset
        $this->assertStringContainsString(
            'text/csv',
            $res->headers->get('Content-Type')
        );

        $content = $res->streamedContent();

        $this->assertStringContainsString(
            'timestamp,action,entity_name',
            $content
        );

        $this->assertStringContainsString(
            'LOGIN_SUCCESS',
            $content
        );
    }
}
