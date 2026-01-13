<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\AuditLog;
use App\Models\Staff;
use App\Models\Role;
use Laravel\Sanctum\Sanctum;
use Illuminate\Foundation\Testing\RefreshDatabase;

class AuditLogFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_audit_logs_can_be_filtered_by_date(): void
    {
        $role = Role::create(['name' => 'Laboratory Head']);
        $staff = Staff::factory()->create(['role_id' => $role->role_id]);

        Sanctum::actingAs($staff);

        AuditLog::create([
            'staff_id' => $staff->staff_id,
            'action' => 'LOGIN_SUCCESS',
            'entity_name' => 'auth',
            'entity_id' => 1,
            'timestamp' => now()->subDays(10),
        ]);

        AuditLog::create([
            'staff_id' => $staff->staff_id,
            'action' => 'LOGOUT',
            'entity_name' => 'auth',
            'entity_id' => 1,
            'timestamp' => now(),
        ]);

        $res = $this->getJson('/api/v1/audit-logs?from=' . now()->subDay()->toDateString());

        $res->assertOk();
        $this->assertCount(1, $res->json('data.data'));
    }
}
