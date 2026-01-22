<?php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SampleRequestQueueApiTest extends TestCase
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

    private function createSample(int $creatorStaffId, string $requestStatus, ?string $submittedAt = null): int
    {
        $clientId = $this->createClientId();

        $payload = [
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'routine',
            'priority' => 0,
            'current_status' => 'received',
            'created_by' => $creatorStaffId,
            'request_status' => $requestStatus,
            'submitted_at' => $submittedAt ? $submittedAt : null,
        ];

        $cols = array_flip(Schema::getColumnListing('samples'));
        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    public function test_admin_can_list_request_queue(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_queue@test.local');
        Sanctum::actingAs($admin, ['*']);

        $this->createSample((int) $admin->staff_id, 'submitted', now()->subDays(2)->toDateTimeString());
        $this->createSample((int) $admin->staff_id, 'ready_for_delivery', now()->subDay()->toDateTimeString());
        $this->createSample((int) $admin->staff_id, 'physically_received', now()->toDateTimeString());

        $res = $this->getJson('/api/v1/samples/requests');

        $res->assertStatus(200);
        $res->assertJsonStructure([
            'data',
            'meta' => ['current_page', 'last_page', 'per_page', 'total'],
        ]);

        $this->assertCount(3, $res->json('data'));
        $this->assertSame(3, (int) $res->json('meta.total'));
    }

    public function test_can_filter_by_request_status(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_queue_filter@test.local');
        Sanctum::actingAs($admin, ['*']);

        $this->createSample((int) $admin->staff_id, 'submitted', now()->subDays(2)->toDateTimeString());
        $this->createSample((int) $admin->staff_id, 'ready_for_delivery', now()->subDay()->toDateTimeString());

        $res = $this->getJson('/api/v1/samples/requests?request_status=submitted');

        $res->assertStatus(200);
        $this->assertCount(1, $res->json('data'));
        $this->assertSame('submitted', $res->json('data.0.request_status'));
    }

    public function test_can_filter_by_submitted_date_range(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_queue_date@test.local');
        Sanctum::actingAs($admin, ['*']);

        $this->createSample((int) $admin->staff_id, 'submitted', now()->subDays(10)->toDateTimeString());
        $this->createSample((int) $admin->staff_id, 'submitted', now()->subDays(2)->toDateTimeString());

        $from = now()->subDays(3)->toDateString();
        $to   = now()->toDateString();

        $res = $this->getJson("/api/v1/samples/requests?submitted_from={$from}&submitted_to={$to}");

        $res->assertStatus(200);
        $this->assertCount(1, $res->json('data'));
    }
}
