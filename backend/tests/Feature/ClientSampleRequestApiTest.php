<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClientSampleRequestApiTest extends TestCase
{
    use RefreshDatabase;

    private ?int $fallbackStaffId = null;

    private function ensureRole(string $name): int
    {
        if (!Schema::hasTable('roles')) return 1;

        $existing = DB::table('roles')->where('name', $name)->value('role_id');
        if ($existing) return (int) $existing;

        $payload = [
            'name' => $name,
            'description' => 'Auto role for tests',
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('roles'));
        $insert = array_intersect_key($payload, $cols);

        return (int) DB::table('roles')->insertGetId($insert, 'role_id');
    }

    private function createStaff(string $roleName, string $email): Staff
    {
        $roleId = $this->ensureRole($roleName);

        $payload = [
            'name'          => $roleName . ' User',
            'email'         => $email,
            'password_hash' => bcrypt('password'),
            'role_id'       => $roleId,
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('staffs'));
        $insert = array_intersect_key($payload, $cols);

        if (isset($cols['password']) && !isset($insert['password'])) {
            $insert['password'] = $insert['password_hash'];
        }

        DB::table('staffs')->insert($insert);

        $id = (int) DB::table('staffs')->where('email', $email)->value('staff_id');
        return Staff::query()->findOrFail($id);
    }

    private function ensureFallbackStaffId(): int
    {
        if ($this->fallbackStaffId !== null) return $this->fallbackStaffId;

        if (!Schema::hasTable('staffs')) {
            $this->fallbackStaffId = 1;
            return 1;
        }

        $staff = $this->createStaff('ADMIN', 'fallback_' . uniqid() . '@test.local');
        $this->fallbackStaffId = (int) ($staff->staff_id ?? $staff->getKey());

        return $this->fallbackStaffId;
    }

    private function createClient(string $email): Client
    {
        $payload = [
            'type'          => 'individual',
            'name'          => 'Test Client',
            'email'         => $email,
            'phone'         => '081234567890',
            'password_hash' => bcrypt('password'),
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('clients'));
        DB::table('clients')->insert(array_intersect_key($payload, $cols));

        $pk = Schema::hasColumn('clients', 'client_id') ? 'client_id' : 'id';
        $id = (int) DB::table('clients')->orderByDesc($pk)->value($pk);

        return Client::query()->findOrFail($id);
    }

    private function createSampleForClient(int $clientId, string $requestStatus, array $overrides = []): int
    {
        $cols = array_flip(Schema::getColumnListing('samples'));

        $payload = array_merge([
            'client_id'      => $clientId,
            'request_status' => $requestStatus,
            'created_at'     => now(),
            'updated_at'     => now(),
        ], $overrides);

        // FK staff (kalau ada)
        if (isset($cols['created_by']) && (empty($payload['created_by']) || $payload['created_by'] === null)) {
            $payload['created_by'] = $this->ensureFallbackStaffId();
        }
        if (isset($cols['assigned_to']) && (empty($payload['assigned_to']) || $payload['assigned_to'] === null)) {
            $payload['assigned_to'] = $this->ensureFallbackStaffId();
        }

        // minimal fields supaya record valid (hindari NOT NULL violation)
        if (isset($cols['current_status']) && (empty($payload['current_status']) || $payload['current_status'] === null)) {
            $payload['current_status'] = 'received';
        }
        if (isset($cols['priority']) && !array_key_exists('priority', $payload)) {
            $payload['priority'] = 0;
        }

        // IMPORTANT: jangan pernah biarkan sample_type/received_at null kalau kolom ada (schema kamu NOT NULL)
        if (isset($cols['sample_type'])) {
            if (!array_key_exists('sample_type', $payload) || $payload['sample_type'] === null) {
                $payload['sample_type'] = 'routine';
            }
        }
        if (isset($cols['received_at'])) {
            if (!array_key_exists('received_at', $payload) || $payload['received_at'] === null) {
                $payload['received_at'] = now()->toDateTimeString();
            }
        }

        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    public function test_client_can_create_draft_request(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $res = $this->postJson('/api/v1/client/samples', [
            'sample_type' => 'routine',
            'notes' => 'please test this sample',
        ]);

        $res->assertStatus(201);

        $sampleId = (int) ($res->json('data.sample_id') ?? 0);
        $this->assertTrue($sampleId > 0);

        $this->assertDatabaseHas('samples', [
            'sample_id'      => $sampleId,
            'client_id'      => (int) ($client->client_id ?? $client->getKey()),
            'request_status' => 'draft',
        ]);
    }

    public function test_client_can_update_draft_request(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $clientId = (int) ($client->client_id ?? $client->getKey());
        $sampleId = $this->createSampleForClient($clientId, 'draft');

        $res = $this->patchJson("/api/v1/client/samples/{$sampleId}", [
            'sample_type' => 'nasopharyngeal swab',
            'received_at' => now()->toDateTimeString(),
        ]);

        $res->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id'   => $sampleId,
            'sample_type' => 'nasopharyngeal swab',
        ]);
    }

    public function test_client_cannot_submit_without_required_fields(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $clientId = (int) ($client->client_id ?? $client->getKey());

        // record VALID (hindari DB crash). yang kita test adalah validasi SubmitRequest (422)
        $sampleId = $this->createSampleForClient($clientId, 'draft', [
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ]);

        $res = $this->postJson("/api/v1/client/samples/{$sampleId}/submit", [
            // kosong -> harus fail 422 (SubmitRequest require sample_type + received_at)
        ]);

        $res->assertStatus(422);
    }

    public function test_client_can_submit_draft_request(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $clientId = (int) ($client->client_id ?? $client->getKey());
        $sampleId = $this->createSampleForClient($clientId, 'draft', [
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ]);

        $res = $this->postJson("/api/v1/client/samples/{$sampleId}/submit", [
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ]);

        $res->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id'      => $sampleId,
            'request_status' => 'submitted',
        ]);

        if (Schema::hasColumn('samples', 'submitted_at')) {
            $this->assertNotNull(DB::table('samples')->where('sample_id', $sampleId)->value('submitted_at'));
        }
    }

    public function test_client_can_resubmit_after_returned(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $clientId = (int) ($client->client_id ?? $client->getKey());

        // returned tapi record tetap valid (hindari NOT NULL crash)
        $sampleId = $this->createSampleForClient($clientId, 'returned', [
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ]);

        // revise (update)
        $this->patchJson("/api/v1/client/samples/{$sampleId}", [
            'notes'       => 'revised after returned',
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ])->assertStatus(200);

        // resubmit
        $this->postJson("/api/v1/client/samples/{$sampleId}/submit", [
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ])->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id'      => $sampleId,
            'request_status' => 'submitted',
        ]);
    }

    public function test_client_cannot_submit_other_clients_sample(): void
    {
        $clientA = $this->createClient('clientA_' . uniqid() . '@test.local');
        $clientB = $this->createClient('clientB_' . uniqid() . '@test.local');

        $clientBId = (int) ($clientB->client_id ?? $clientB->getKey());
        $sampleId = $this->createSampleForClient($clientBId, 'draft');

        Sanctum::actingAs($clientA, ['*']);

        $this->postJson("/api/v1/client/samples/{$sampleId}/submit", [
            'sample_type' => 'routine',
            'received_at' => now()->toDateTimeString(),
        ])->assertStatus(403);
    }

    public function test_staff_forbidden_on_client_endpoints(): void
    {
        $staff = $this->createStaff('ADMIN', 'admin_' . uniqid() . '@test.local');
        Sanctum::actingAs($staff, ['*']);

        $this->postJson('/api/v1/client/samples', [
            'sample_type' => 'routine',
            'notes' => 'should be forbidden',
        ])->assertStatus(403);

        $this->getJson('/api/v1/client/samples')
            ->assertStatus(403);
    }
}
