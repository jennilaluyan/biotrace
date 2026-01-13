<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\AuditLog;
use App\Models\Staff;
use App\Models\Role;
use Laravel\Sanctum\Sanctum;
use Illuminate\Foundation\Testing\RefreshDatabase;

class AuditLogPdfExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_pdf_export_requires_filter(): void
    {
        $role = Role::create(['name' => 'Laboratory Head']);
        $staff = Staff::factory()->create(['role_id' => $role->role_id]);

        Sanctum::actingAs($staff);

        $res = $this->get('/api/v1/audit-logs/export/pdf');

        $res->assertStatus(422);
    }

    public function test_pdf_export_with_date_filter_succeeds(): void
    {
        $role = Role::create(['name' => 'Laboratory Head']);
        $staff = Staff::factory()->create(['role_id' => $role->role_id]);

        Sanctum::actingAs($staff);

        AuditLog::create([
            'staff_id' => $staff->staff_id,
            'action' => 'LOGIN_SUCCESS',
            'entity_name' => 'auth',
            'entity_id' => 1,
            'timestamp' => now(),
        ]);

        $res = $this->get('/api/v1/audit-logs/export/pdf?from=' . now()->subDay()->toDateString());

        $res->assertOk();
        $res->assertHeader('Content-Type', 'application/pdf');
    }
}
