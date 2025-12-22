<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Role;
use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;

class SampleStatusTransitionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function createStaffWithRole(string $roleName): Staff
    {
        $role = Role::firstOrCreate(
            ['name' => $roleName],
            ['description' => 'Test role ' . $roleName]
        );

        return Staff::create([
            'name'          => 'Test ' . $roleName,
            'email'         => 'test_' . strtolower(str_replace(' ', '_', $roleName)) . '@example.com',
            'password_hash' => bcrypt('secret'),
            'role_id'       => $role->role_id,
            'is_active'     => true,
        ]);
    }

    protected function createClient(?Staff $pic = null): Client
    {
        $pic ??= $this->createStaffWithRole('Administrator');

        return Client::create([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'Transition Client',
            'email'    => 'client_' . $pic->staff_id . '@example.com',
        ]);
    }

    protected function createSample(Client $client, Staff $creator, string $status): Sample
    {
        return Sample::create([
            'client_id'           => $client->client_id,
            'received_at'         => now(),
            'sample_type'         => 'nasopharyngeal swab',
            'examination_purpose' => 'diagnostic',
            'contact_history'     => 'tidak',
            'priority'            => 1,
            'current_status'      => $status,
            'additional_notes'    => 'Transition test sample',
            'created_by'          => $creator->staff_id,
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_transition_received_to_in_progress(): void
    {
        $admin  = $this->createStaffWithRole('Administrator');
        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'received');

        $this->actingAs($admin);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'in_progress',
            'note' => 'handoff to analyst',
        ])->assertStatus(200)
            ->assertJsonPath('data.current_status', 'in_progress');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function analyst_cannot_transition_received_to_in_progress(): void
    {
        $admin   = $this->createStaffWithRole('Administrator');
        $analyst = $this->createStaffWithRole('Analyst');

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'received');

        $this->actingAs($analyst);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'in_progress',
        ])->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function analyst_can_transition_in_progress_to_testing_completed(): void
    {
        $admin   = $this->createStaffWithRole('Administrator');
        $analyst = $this->createStaffWithRole('Analyst');

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'in_progress');

        $this->actingAs($analyst);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'testing_completed',
        ])->assertStatus(200)
            ->assertJsonPath('data.current_status', 'testing_completed');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function om_can_transition_testing_completed_to_verified(): void
    {
        $admin = $this->createStaffWithRole('Administrator');
        $om    = $this->createStaffWithRole('Operational Manager');

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'testing_completed');

        $this->actingAs($om);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'verified',
        ])->assertStatus(200)
            ->assertJsonPath('data.current_status', 'verified');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function lab_head_can_transition_verified_to_validated_and_validated_to_reported(): void
    {
        $admin = $this->createStaffWithRole('Administrator');
        $lh    = $this->createStaffWithRole('Laboratory Head');

        $client = $this->createClient($admin);

        $sample1 = $this->createSample($client, $admin, 'verified');
        $sample2 = $this->createSample($client, $admin, 'validated');

        $this->actingAs($lh);

        $this->postJson("/api/v1/samples/{$sample1->sample_id}/status", [
            'target_status' => 'validated',
        ])->assertStatus(200)
            ->assertJsonPath('data.current_status', 'validated');

        $this->postJson("/api/v1/samples/{$sample2->sample_id}/status", [
            'target_status' => 'reported',
        ])->assertStatus(200)
            ->assertJsonPath('data.current_status', 'reported');
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function lab_head_cannot_skip_from_verified_to_reported(): void
    {
        $admin = $this->createStaffWithRole('Administrator');
        $lh    = $this->createStaffWithRole('Laboratory Head');

        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'verified');

        $this->actingAs($lh);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'reported',
        ])->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function cannot_set_same_status_returns_400(): void
    {
        $admin  = $this->createStaffWithRole('Administrator');
        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'received');

        $this->actingAs($admin);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'received',
        ])->assertStatus(400);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function invalid_target_status_returns_422(): void
    {
        $admin  = $this->createStaffWithRole('Administrator');
        $client = $this->createClient($admin);
        $sample = $this->createSample($client, $admin, 'received');

        $this->actingAs($admin);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'target_status' => 'not_a_real_status',
        ])->assertStatus(422);
    }
}
