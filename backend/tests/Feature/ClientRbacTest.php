<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Staff;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ClientRbacTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper: buat Role kalau belum ada.
     */
    protected function getOrCreateRole(string $name): Role
    {
        return Role::firstOrCreate(
            ['name' => $name],
            ['description' => 'Test role ' . $name]
        );
    }

    /**
     * Helper: buat Staff dengan role tertentu (tanpa factory).
     */
    protected function createStaffWithRole(string $roleName): Staff
    {
        $role = $this->getOrCreateRole($roleName);

        return Staff::create([
            'name'          => 'Test ' . $roleName,
            'email'         => 'test_' . $roleName . '@example.com',
            'password_hash' => bcrypt('secret'),
            'role_id'       => $role->role_id,
            'is_active'     => true,
        ]);
    }

    /**
     * Helper: buat 1 client dummy (tanpa factory).
     */
    protected function createClient(?Staff $pic = null): Client
    {
        $pic ??= $this->createStaffWithRole('administrator');

        return Client::create([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'Test Client',
            'email'    => 'client@example.com',
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]

    public function admin_can_crud_clients()
    {
        $admin = $this->createStaffWithRole('administrator');
        $this->actingAs($admin);

        $clientData = [
            'staff_id' => $admin->staff_id,
            'type'     => 'individual',
            'name'     => 'New Client',
            'email'    => 'newclient@example.com',
        ];

        // CREATE
        $createResponse = $this->postJson('/api/v1/clients', $clientData);
        $createResponse->assertStatus(201);

        $clientId = $createResponse->json('data.client_id');

        // READ LIST
        $this->getJson('/api/v1/clients')->assertStatus(200);

        // READ DETAIL
        $this->getJson("/api/v1/clients/{$clientId}")->assertStatus(200);

        // UPDATE
        $updateResponse = $this->putJson("/api/v1/clients/{$clientId}", [
            'staff_id' => $admin->staff_id,
            'type'     => 'individual',
            'name'     => 'Updated Client',
            'email'    => 'updated@example.com',
        ]);
        $updateResponse->assertStatus(200);

        // DELETE (SOFT DELETE)
        $deleteResponse = $this->deleteJson("/api/v1/clients/{$clientId}");
        $deleteResponse->assertStatus(200);

        // Row masih ada, tapi harus soft-deleted
        $this->assertSoftDeleted('clients', ['client_id' => $clientId]);

        // Pastikan tidak muncul lagi di index
        $after = $this->getJson('/api/v1/clients')->assertStatus(200)->json('data') ?? [];
        $this->assertFalse(
            collect($after)->contains(fn($row) => ($row['client_id'] ?? null) === (int)$clientId),
            'Client yang sudah soft-deleted tidak boleh tampil di list.'
        );
    }

    #[\PHPUnit\Framework\Attributes\Test]

    public function operational_manager_can_only_read_clients()
    {
        $om = $this->createStaffWithRole('operational manager');
        $this->actingAs($om);

        $client = $this->createClient(); // pakai PIC admin

        // READ LIST & DETAIL -> 200
        $this->getJson('/api/v1/clients')->assertStatus(200);
        $this->getJson("/api/v1/clients/{$client->client_id}")->assertStatus(200);

        // CREATE -> 403
        $this->postJson('/api/v1/clients', [
            'staff_id' => $om->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked',
            'email'    => 'blocked@example.com',
        ])->assertStatus(403);

        // UPDATE -> 403
        $this->putJson("/api/v1/clients/{$client->client_id}", [
            'staff_id' => $om->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked Update',
            'email'    => 'blocked@example.com',
        ])->assertStatus(403);

        // DELETE -> 403
        $this->deleteJson("/api/v1/clients/{$client->client_id}")
            ->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]

    public function lab_head_can_only_read_clients()
    {
        $lh = $this->createStaffWithRole('laboratory head');
        $this->actingAs($lh);

        $client = $this->createClient();

        // READ LIST & DETAIL -> 200
        $this->getJson('/api/v1/clients')->assertStatus(200);
        $this->getJson("/api/v1/clients/{$client->client_id}")->assertStatus(200);

        // CREATE -> 403
        $this->postJson('/api/v1/clients', [
            'staff_id' => $lh->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked',
            'email'    => 'blocked@example.com',
        ])->assertStatus(403);

        // UPDATE -> 403
        $this->putJson("/api/v1/clients/{$client->client_id}", [
            'staff_id' => $lh->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked Update',
            'email'    => 'blocked@example.com',
        ])->assertStatus(403);

        // DELETE -> 403
        $this->deleteJson("/api/v1/clients/{$client->client_id}")
            ->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]

    public function operator_cannot_access_clients()
    {
        // pilih salah satu: analyst atau sample collector
        $operator = $this->createStaffWithRole('analyst');
        $this->actingAs($operator);

        $client = $this->createClient();

        // READ LIST & DETAIL -> 403
        $this->getJson('/api/v1/clients')->assertStatus(403);
        $this->getJson("/api/v1/clients/{$client->client_id}")->assertStatus(403);

        // CREATE -> 403
        $this->postJson('/api/v1/clients', [
            'staff_id' => $operator->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked',
            'email'    => 'blocked@example.com',
        ])->assertStatus(403);

        // UPDATE -> 403
        $this->putJson("/api/v1/clients/{$client->client_id}", [
            'staff_id' => $operator->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked Update',
            'email'    => 'blocked@example.com',
        ])->assertStatus(403);

        // DELETE -> 403
        $this->deleteJson("/api/v1/clients/{$client->client_id}")
            ->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]

    public function guest_cannot_access_clients()
    {
        $client = $this->createClient();

        // Tanpa $this->actingAs()

        $this->getJson('/api/v1/clients')->assertStatus(401);
        $this->getJson("/api/v1/clients/{$client->client_id}")->assertStatus(401);

        $this->postJson('/api/v1/clients', [
            'staff_id' => $client->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked',
            'email'    => 'blocked@example.com',
        ])->assertStatus(401);

        $this->putJson("/api/v1/clients/{$client->client_id}", [
            'staff_id' => $client->staff_id,
            'type'     => 'individual',
            'name'     => 'Blocked Update',
            'email'    => 'blocked@example.com',
        ])->assertStatus(401);

        $this->deleteJson("/api/v1/clients/{$client->client_id}")
            ->assertStatus(401);
    }
}
