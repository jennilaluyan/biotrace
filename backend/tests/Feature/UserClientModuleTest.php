<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Staff;
use App\Models\Role;
use App\Models\Sample;
use Illuminate\Foundation\Testing\RefreshDatabase;

class UserClientModuleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper: buat Role kalau belum ada (sama dengan pola di ClientRbacTest).
     */
    protected function getOrCreateRole(string $name): Role
    {
        return Role::firstOrCreate(
            ['name' => $name],
            ['description' => 'Test role ' . $name]
        );
    }

    /**
     * Helper: buat Staff dengan role tertentu.
     */
    protected function createStaffWithRole(string $roleName): Staff
    {
        $role = $this->getOrCreateRole($roleName);

        return Staff::create([
            'name'          => 'Test ' . $roleName,
            'email'         => 'test_' . str_replace(' ', '_', $roleName) . '@example.com',
            'password_hash' => bcrypt('secret'),
            'role_id'       => $role->role_id,
            'is_active'     => true,
        ]);
    }

    /**
     * Helper: buat 1 client dummy.
     */
    protected function createClient(?Staff $pic = null, array $overrides = []): Client
    {
        $pic ??= $this->createStaffWithRole('administrator');

        $data = array_merge([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'Test Client',
            'phone'    => '08123456789',
            'email'    => 'client_' . $pic->staff_id . '@example.com',
        ], $overrides);

        return Client::create($data);
    }

    /**
     * Helper: buat sample untuk client tertentu.
     *
     * Wajib patuh ke CHECK constraints:
     * - current_status ∈ {'received','in_progress','testing_completed','verified','validated','reported'}
     * - contact_history ∈ {NULL,'ada','tidak','tidak_tahu'}
     */
    protected function createSampleForClient(Client $client, Staff $creator, array $overrides = []): Sample
    {
        $base = [
            'client_id'           => $client->client_id,
            'received_at'         => now(),
            'sample_type'         => 'nasopharyngeal swab',
            'examination_purpose' => 'diagnostic',
            'contact_history'     => 'tidak',    // valid nilai sesuai constraint
            'priority'            => 0,
            'current_status'      => 'received', // status awal yang valid
            'additional_notes'    => 'Client Sample',
            'created_by'          => $creator->staff_id,
        ];

        return Sample::create(array_merge($base, $overrides));
    }

    // ---------------------------------------------------------------------
    // CLIENT CRUD beyond RBAC
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_create_client_and_persist_it(): void
    {
        $admin = $this->createStaffWithRole('administrator');
        $this->actingAs($admin);

        $payload = [
            'staff_id' => $admin->staff_id,
            'type'     => 'individual',
            'name'     => 'New Client',
            'phone'    => '081122334455',
            'email'    => 'newclient@example.com',
        ];

        $response = $this->postJson('/api/v1/clients', $payload);

        $response
            ->assertStatus(201)
            ->assertJsonPath('data.name', 'New Client')
            ->assertJsonPath('data.email', 'newclient@example.com');

        $this->assertDatabaseHas('clients', [
            'name'  => 'New Client',
            'email' => 'newclient@example.com',
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_update_client_and_persist_changes(): void
    {
        $admin = $this->createStaffWithRole('administrator');
        $this->actingAs($admin);

        $client = $this->createClient($admin);

        $payload = [
            'staff_id' => $admin->staff_id,
            'type'     => 'individual',
            'name'     => 'Updated Client Name',
            'phone'    => '0899999999',
            'email'    => 'updatedclient@example.com',
        ];

        $response = $this->putJson("/api/v1/clients/{$client->client_id}", $payload);

        $response
            ->assertStatus(200)
            ->assertJsonPath('data.name', 'Updated Client Name')
            ->assertJsonPath('data.email', 'updatedclient@example.com');

        $this->assertDatabaseHas('clients', [
            'client_id' => $client->client_id,
            'name'      => 'Updated Client Name',
            'email'     => 'updatedclient@example.com',
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_soft_delete_client_and_it_disappears_from_index(): void
    {
        $admin = $this->createStaffWithRole('administrator');
        $this->actingAs($admin);

        $client = $this->createClient($admin);

        // Pastikan client muncul di index sebelum delete
        $indexBefore = $this->getJson('/api/v1/clients');
        $indexBefore->assertStatus(200);

        $beforeJson = $indexBefore->json();
        $this->assertIsArray($beforeJson['data'] ?? [], 'Response data sebelum delete harus array.');

        $this->assertTrue(
            collect($beforeJson['data'])
                ->contains(fn($row) => ($row['client_id'] ?? null) === $client->client_id),
            'Client harus muncul di index sebelum dihapus.'
        );

        // Soft delete via API
        $deleteResponse = $this->deleteJson("/api/v1/clients/{$client->client_id}");
        $deleteResponse->assertStatus(200);

        // Tabel menggunakan SoftDeletes
        $this->assertSoftDeleted('clients', [
            'client_id' => $client->client_id,
        ]);

        // Index sesudah delete: client tidak boleh muncul lagi
        $indexAfter = $this->getJson('/api/v1/clients');
        $indexAfter->assertStatus(200);

        $afterJson = $indexAfter->json();
        $this->assertIsArray($afterJson['data'] ?? [], 'Response data sesudah delete harus array.');

        $this->assertFalse(
            collect($afterJson['data'])
                ->contains(fn($row) => ($row['client_id'] ?? null) === $client->client_id),
            'Client yang sudah soft-deleted tidak boleh tampil di list.'
        );
    }

    // ---------------------------------------------------------------------
    // CLIENT ↔ SAMPLES nested endpoint
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_fetch_samples_for_a_specific_client_via_nested_endpoint(): void
    {
        $admin = $this->createStaffWithRole('administrator');
        $this->actingAs($admin);

        $client = $this->createClient($admin);

        $sampleA = $this->createSampleForClient($client, $admin, [
            'additional_notes' => 'Client Sample A',
        ]);
        $sampleB = $this->createSampleForClient($client, $admin, [
            'additional_notes' => 'Client Sample B',
        ]);

        $response = $this->getJson("/api/v1/clients/{$client->client_id}/samples");

        $response->assertStatus(200);

        $json = $response->json();
        $this->assertIsArray($json['data'] ?? [], 'Response data harus array.');

        $ids = collect($json['data'])->pluck('sample_id')->all();

        $this->assertContains($sampleA->sample_id, $ids, 'Sample A harus muncul di nested endpoint.');
        $this->assertContains($sampleB->sample_id, $ids, 'Sample B harus muncul di nested endpoint.');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function client_samples_endpoint_does_not_leak_other_clients_samples(): void
    {
        $admin = $this->createStaffWithRole('administrator');
        $this->actingAs($admin);

        $clientA = $this->createClient($admin, [
            'name'  => 'Client A',
            'email' => 'clienta@example.com',
        ]);
        $clientB = $this->createClient($admin, [
            'name'  => 'Client B',
            'email' => 'clientb@example.com',
        ]);

        // Sample milik Client A
        $sampleA1 = $this->createSampleForClient($clientA, $admin, [
            'additional_notes' => 'Client A Sample 1',
        ]);
        $sampleA2 = $this->createSampleForClient($clientA, $admin, [
            'additional_notes' => 'Client A Sample 2',
        ]);

        // Sample milik Client B
        $sampleB1 = $this->createSampleForClient($clientB, $admin, [
            'additional_notes' => 'Client B Sample 1',
        ]);

        $response = $this->getJson("/api/v1/clients/{$clientA->client_id}/samples");

        $response->assertStatus(200);

        $json = $response->json();
        $this->assertIsArray($json['data'] ?? [], 'Response data harus array.');

        $ids = collect($json['data'])->pluck('sample_id')->all();

        // Hanya sample Client A yang boleh tampil
        $this->assertContains($sampleA1->sample_id, $ids);
        $this->assertContains($sampleA2->sample_id, $ids);
        $this->assertNotContains($sampleB1->sample_id, $ids, 'Sample milik client lain tidak boleh bocor.');
    }
}
