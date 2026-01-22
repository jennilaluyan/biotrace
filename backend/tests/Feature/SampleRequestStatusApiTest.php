<?php

namespace Tests\Feature;

use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SampleRequestStatusApiTest extends TestCase
{
    use RefreshDatabase;

    private function ensureRole(string $name): int
    {
        $existing = DB::table('roles')->where('name', $name)->value('role_id');
        if ($existing) return (int) $existing;

        return (int) DB::table('roles')->insertGetId([
            'name' => $name,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'role_id');
    }

    private function createStaff(string $roleName, string $email): Staff
    {
        $roleId = $this->ensureRole($roleName);

        $payload = [
            'name' => $roleName . ' User',
            'email' => $email,
            'password_hash' => bcrypt('password'),
            'role_id' => $roleId,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('staffs'));
        DB::table('staffs')->insert(array_intersect_key($payload, $cols));

        $id = (int) DB::table('staffs')->where('email', $email)->value('staff_id');
        return Staff::query()->findOrFail($id);
    }

    private function createClientId(): int
    {
        $payload = [
            'type' => 'individual',
            'name' => 'Test Client',
            'email' => 'client_' . uniqid() . '@test.local',
            'phone' => '081234567890',
            'password_hash' => bcrypt('password'),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('clients'));
        DB::table('clients')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('clients')->orderByDesc('client_id')->value('client_id');
    }

    private function createSampleRow(int $creatorStaffId): int
    {
        $clientId = $this->createClientId();

        $payload = [
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'routine',
            'priority' => 0,
            'current_status' => 'received',
            'created_by' => $creatorStaffId,
        ];

        $cols = array_flip(Schema::getColumnListing('samples'));
        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    public function test_admin_can_update_request_status_submitted_to_ready_for_delivery(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_req_api@test.local');
        Sanctum::actingAs($admin, ['*']);

        $sampleId = $this->createSampleRow((int) $admin->staff_id);
        DB::table('samples')->where('sample_id', $sampleId)->update(['request_status' => 'submitted']);

        $res = $this->postJson("/api/v1/samples/{$sampleId}/request-status", [
            'target_status' => 'ready_for_delivery',
            'note' => 'admin approved and asked client to deliver sample',
        ]);

        $res->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'request_status' => 'ready_for_delivery',
        ]);

        $this->assertTrue(
            DB::table('audit_logs')
                ->where('entity_name', 'samples')
                ->where('entity_id', $sampleId)
                ->where('action', 'SAMPLE_REQUEST_STATUS_CHANGED')
                ->exists(),
            'Expected audit log SAMPLE_REQUEST_STATUS_CHANGED was not found.'
        );
    }

    public function test_admin_cannot_skip_submitted_to_physically_received(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_skip@test.local');
        Sanctum::actingAs($admin, ['*']);

        $sampleId = $this->createSampleRow((int) $admin->staff_id);
        DB::table('samples')->where('sample_id', $sampleId)->update(['request_status' => 'submitted']);

        $this->postJson("/api/v1/samples/{$sampleId}/request-status", [
            'target_status' => 'physically_received',
        ])->assertStatus(403);
    }

    public function test_non_authorized_role_forbidden(): void
    {
        $analyst = $this->createStaff('Analyst', 'analyst_req_api@test.local');
        Sanctum::actingAs($analyst, ['*']);

        $sampleId = $this->createSampleRow((int) $analyst->staff_id);
        DB::table('samples')->where('sample_id', $sampleId)->update(['request_status' => 'submitted']);

        $this->postJson("/api/v1/samples/{$sampleId}/request-status", [
            'target_status' => 'ready_for_delivery',
        ])->assertStatus(403);
    }
}
