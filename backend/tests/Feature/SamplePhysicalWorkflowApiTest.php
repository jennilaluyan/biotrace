<?php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SamplePhysicalWorkflowApiTest extends TestCase
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
        $insert = array_intersect_key($payload, $cols);

        // Some schemas use "password" column instead of password_hash
        if (isset($cols['password']) && !isset($insert['password']) && isset($insert['password_hash'])) {
            $insert['password'] = $insert['password_hash'];
        }

        DB::table('staffs')->insert($insert);

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

    public function test_admin_can_record_admin_received_from_client(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_pw_' . uniqid() . '@test.local');
        Sanctum::actingAs($admin, ['*']);

        $sampleId = $this->createSampleRow((int) $admin->staff_id);

        $res = $this->patchJson("/api/v1/samples/{$sampleId}/physical-workflow", [
            'action' => 'admin_received_from_client',
            'note' => 'Received at front desk',
        ]);

        $res->assertStatus(200);

        // Column name depends on migration; assert at least audit exists
        if (Schema::hasTable('audit_logs')) {
            $this->assertTrue(
                DB::table('audit_logs')
                    ->where('entity_name', 'samples')
                    ->where('entity_id', $sampleId)
                    ->where('action', 'SAMPLE_PHYSICAL_WORKFLOW_CHANGED')
                    ->exists(),
                'Expected audit log SAMPLE_PHYSICAL_WORKFLOW_CHANGED was not found.'
            );
        }
    }

    public function test_collector_forbidden_to_do_admin_action(): void
    {
        $sc = $this->createStaff('Sample Collector', 'sc_pw_' . uniqid() . '@test.local');
        Sanctum::actingAs($sc, ['*']);

        $sampleId = $this->createSampleRow((int) $sc->staff_id);

        $this->patchJson("/api/v1/samples/{$sampleId}/physical-workflow", [
            'action' => 'admin_received_from_client',
        ])->assertStatus(403);
    }

    public function test_cannot_skip_prerequisite_chain(): void
    {
        $sc = $this->createStaff('Sample Collector', 'sc_skip_' . uniqid() . '@test.local');
        Sanctum::actingAs($sc, ['*']);

        $sampleId = $this->createSampleRow((int) $sc->staff_id);

        // collector_intake_completed requires collector_received
        $this->patchJson("/api/v1/samples/{$sampleId}/physical-workflow", [
            'action' => 'collector_intake_completed',
        ])->assertStatus(422);
    }

    public function test_custody_alias_endpoint_works(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_cust_' . uniqid() . '@test.local');
        Sanctum::actingAs($admin, ['*']);

        $sampleId = $this->createSampleRow((int) $admin->staff_id);

        $res = $this->postJson("/api/v1/samples/{$sampleId}/custody", [
            'event_key' => 'admin_received_from_client',
            'note' => 'Alias endpoint',
        ]);

        $res->assertStatus(200);
    }
}
