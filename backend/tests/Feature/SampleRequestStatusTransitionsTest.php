<?php

namespace Tests\Feature;

use App\Models\Sample;
use App\Models\Staff;
use App\Support\SampleRequestStatusTransitions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SampleRequestStatusTransitionsTest extends TestCase
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
            // jangan set request_status biar default DB kepakai
        ];

        $cols = array_flip(Schema::getColumnListing('samples'));
        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    public function test_request_status_default_is_valid(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_req@test.local');
        $sampleId = $this->createSampleRow((int)$admin->staff_id);

        $row = DB::table('samples')->where('sample_id', $sampleId)->first();
        $this->assertNotNull($row->request_status);

        $this->assertContains($row->request_status, SampleRequestStatusTransitions::allStatuses());
    }

    public function test_admin_can_transition_submitted_to_ready_for_delivery(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_trans@test.local');

        // buat sample dengan request_status submitted (kalau kolom ada)
        $sampleId = $this->createSampleRow((int)$admin->staff_id);
        DB::table('samples')->where('sample_id', $sampleId)->update(['request_status' => 'submitted']);

        $sample = Sample::query()->findOrFail($sampleId);

        $this->assertTrue(
            SampleRequestStatusTransitions::canTransition($admin, $sample, 'ready_for_delivery')
        );
    }

    public function test_admin_cannot_transition_submitted_to_physically_received_directly(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_no_skip@test.local');

        $sampleId = $this->createSampleRow((int)$admin->staff_id);
        DB::table('samples')->where('sample_id', $sampleId)->update(['request_status' => 'submitted']);
        $sample = Sample::query()->findOrFail($sampleId);

        $this->assertFalse(
            SampleRequestStatusTransitions::canTransition($admin, $sample, 'physically_received')
        );
    }
}
