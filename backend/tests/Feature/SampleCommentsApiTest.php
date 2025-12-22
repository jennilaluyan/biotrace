<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Role;
use App\Models\Sample;
use App\Models\SampleComment;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;

class SampleCommentsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RoleSeeder::class);
    }

    protected function createStaffWithRole(string $roleName, int $roleId): Staff
    {
        $role = Role::firstOrCreate(
            ['role_id' => $roleId],
            ['name' => $roleName, 'description' => 'Test role ' . $roleName]
        );

        return Staff::create([
            'name'          => 'Test ' . $roleName,
            'email'         => 'test_' . strtolower(str_replace(' ', '_', $roleName)) . '@example.com',
            'password_hash' => bcrypt('secret'),
            'role_id'       => $role->role_id,
            'is_active'     => true,
        ]);
    }

    protected function createClient(Staff $pic): Client
    {
        return Client::create([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'Comment Client',
            'email'    => 'client_' . $pic->staff_id . '@example.com',
        ]);
    }

    protected function createSample(Client $client, Staff $creator, string $status): Sample
    {
        return Sample::create([
            'client_id' => $client->client_id,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'diagnostic',
            'contact_history' => 'tidak',
            'priority' => 1,
            'current_status' => $status,
            'additional_notes' => 'comment test',
            'created_by' => $creator->staff_id,
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function lab_head_can_add_comment_and_target_role_can_view_it(): void
    {
        // role_id sesuai roles.ts
        $admin   = $this->createStaffWithRole('Administrator', 2);
        $analyst = $this->createStaffWithRole('Analyst', 4);
        $lh      = $this->createStaffWithRole('Laboratory Head', 6);

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'in_progress'); // target: Analyst

        // Lab head add comment
        $this->actingAs($lh);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/comments", [
            'body' => 'Please finish this step today.',
        ])->assertStatus(201);

        // Analyst can view via index
        $this->actingAs($analyst);

        $this->getJson("/api/v1/samples/{$sample->sample_id}/comments")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function non_lab_head_cannot_add_comment(): void
    {
        $admin = $this->createStaffWithRole('Administrator', 2);

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'in_progress');

        $this->actingAs($admin);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/comments", [
            'body' => 'Trying to comment',
        ])->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function non_target_role_cannot_see_comment(): void
    {
        $admin = $this->createStaffWithRole('Administrator', 2);
        $om    = $this->createStaffWithRole('Operational Manager', 5);
        $lh    = $this->createStaffWithRole('Laboratory Head', 6);

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'in_progress'); // target: Analyst

        // add comment by lab head
        $this->actingAs($lh);
        $this->postJson("/api/v1/samples/{$sample->sample_id}/comments", [
            'body' => 'For analyst only',
        ])->assertStatus(201);

        // OM should see 0
        $this->actingAs($om);
        $this->getJson("/api/v1/samples/{$sample->sample_id}/comments")
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');
    }
}