<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Role;
use App\Models\Sample;
use App\Models\Staff;
use App\Enums\SampleHighLevelStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;

class SampleLifecycleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper: buat Staff dengan role tertentu.
     */
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

    /**
     * Helper: buat Client dummy.
     */
    protected function createClient(?Staff $pic = null): Client
    {
        $pic ??= $this->createStaffWithRole('Administrator');

        return Client::create([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'Lifecycle Client',
            'email'    => 'client_' . $pic->staff_id . '@example.com',
        ]);
    }

    /**
     * Helper: buat Sample langsung via model (bukan via controller).
     */
    protected function createSample(Client $client, Staff $creator, string $status = 'received'): Sample
    {
        return Sample::create([
            'client_id'           => $client->client_id,
            'received_at'         => now(),
            'sample_type'         => 'nasopharyngeal swab',
            'examination_purpose' => 'diagnostic',
            'contact_history'     => 'tidak',
            'priority'            => 1,
            'current_status'      => $status,
            'additional_notes'    => 'Lifecycle test sample',
            'created_by'          => $creator->staff_id,
        ]);
    }

    // ---------------------------------------------------------------------
    // BAGIAN YANG SUDAH BISA DI-TEST PENUH (MODEL-LEVEL)
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function sample_model_maps_received_to_registered_status_enum(): void
    {
        $admin  = $this->createStaffWithRole('Administrator');
        $client = $this->createClient($admin);

        $sample = $this->createSample($client, $admin, status: 'received');

        // status_enum adalah accessor yang pakai SampleHighLevelStatus::fromCurrentStatus()
        $this->assertSame(
            'registered',
            $sample->status_enum,
            'Sample dengan current_status=received harus punya status_enum=registered.'
        );
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function sample_model_maps_all_current_statuses_to_correct_high_level_enum(): void
    {
        $admin  = $this->createStaffWithRole('Administrator');
        $client = $this->createClient($admin);

        $mapping = [
            'received'          => SampleHighLevelStatus::REGISTERED,
            'in_progress'       => SampleHighLevelStatus::TESTING,
            'testing_completed' => SampleHighLevelStatus::TESTING,
            'verified'          => SampleHighLevelStatus::TESTING,
            'validated'         => SampleHighLevelStatus::TESTING,
            'reported'          => SampleHighLevelStatus::REPORTED,
        ];

        foreach ($mapping as $currentStatus => $expectedEnum) {
            $sample = $this->createSample($client, $admin, status: $currentStatus);

            $this->assertSame(
                $expectedEnum->value,
                $sample->status_enum,
                "current_status={$currentStatus} harus termapping ke status_enum={$expectedEnum->value}."
            );
        }
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function non_admin_cannot_create_sample_via_api(): void
    {
        $analyst = $this->createStaffWithRole('Analyst');
        $this->actingAs($analyst);

        $client = $this->createClient($analyst);

        $payload = [
            'client_id'           => $client->client_id,
            'received_at'         => now()->toDateTimeString(),
            'sample_type'         => 'nasopharyngeal swab',
            'examination_purpose' => 'diagnostic',
            'contact_history'     => 'tidak',
            'priority'            => 1,
            'additional_notes'    => 'Non-admin should be forbidden',
        ];

        // SamplePolicy::create() hanya memperbolehkan Administrator.
        // Jadi di sini request HARUS 403 dan TIDAK menyentuh DB insert.
        $this->postJson('/api/v1/samples', $payload)
            ->assertStatus(403);
    }

    // ---------------------------------------------------------------------
    // BAGIAN YANG MASIH PENDING (BUTUH IMPLEMENTASI LANJUT)
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_create_sample_via_api_and_initial_status_is_registered()
    {
        // 1) Arrange: buat admin & client
        $admin = $this->createStaffWithRole('Administrator');
        $this->actingAs($admin);

        $client = $this->createClient($admin);

        // 2) Payload valid
        $payload = [
            'client_id'           => $client->client_id,
            'received_at'         => now()->toDateTimeString(),
            'sample_type'         => 'nasopharyngeal swab',
            'examination_purpose' => 'diagnostic',
            'contact_history'     => 'tidak',
            'priority'            => 1,
            'additional_notes'    => 'Lifecycle test sample',
        ];

        // 3) Hit endpoint
        $response = $this->postJson('/api/v1/samples', $payload);

        // 4) Assert response
        $response
            ->assertStatus(201)
            ->assertJsonPath('message', 'Sample registered successfully.')
            ->assertJsonPath('data.client_id', $client->client_id)
            ->assertJsonPath('data.current_status', 'received')
            // ini pakai accessor status_enum di model Sample
            ->assertJsonPath('data.status_enum', 'registered');

        // 5) Assert DB
        $this->assertDatabaseHas('samples', [
            'client_id'   => $client->client_id,
            'current_status' => 'received',
            'created_by'  => $admin->staff_id,
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function auto_assigns_assigned_to_to_creator_on_sample_create(): void
    {
        // Arrange: buat admin + login
        $admin = $this->createStaffWithRole('Administrator');
        $this->actingAs($admin);

        // Client wajib punya staff_id (PIC internal)
        $client = $this->createClient($admin);

        $payload = [
            'client_id'   => $client->client_id,
            'received_at' => now()->toDateTimeString(),
            'sample_type' => 'Swab',
            'priority'    => 1,
        ];

        // Act
        $res = $this->postJson('/api/v1/samples', $payload);

        // Assert response
        $res->assertStatus(201);
        $res->assertJsonPath('data.created_by', $admin->staff_id);
        $res->assertJsonPath('data.assigned_to', $admin->staff_id);

        $sampleId = $res->json('data.sample_id');

        // Assert DB
        $this->assertDatabaseHas('samples', [
            'sample_id'   => $sampleId,
            'created_by'  => $admin->staff_id,
            'assigned_to' => $admin->staff_id,
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_cannot_override_assigned_to_on_sample_create(): void
    {
        $admin = $this->createStaffWithRole('Administrator');
        $this->actingAs($admin);

        $assignee = $this->createStaffWithRole('Sample Collector');
        $client   = $this->createClient($admin);

        $payload = [
            'client_id'   => $client->client_id,
            'received_at' => now()->toDateTimeString(),
            'sample_type' => 'Swab',
            'priority'    => 1,
            'assigned_to' => $assignee->staff_id, // override attempt
        ];

        $this->postJson('/api/v1/samples', $payload)
            ->assertStatus(403);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function lab_head_can_override_assigned_to_on_sample_create(): void
    {
        $labHead = $this->createStaffWithRole('Laboratory Head');
        $this->actingAs($labHead);

        $assignee = $this->createStaffWithRole('Sample Collector');
        $client   = $this->createClient($labHead);

        $payload = [
            'client_id'   => $client->client_id,
            'received_at' => now()->toDateTimeString(),
            'sample_type' => 'Swab',
            'priority'    => 1,
            'assigned_to' => $assignee->staff_id,
        ];

        $res = $this->postJson('/api/v1/samples', $payload);

        $res->assertCreated();
        $res->assertJsonPath('data.created_by', $labHead->staff_id);
        $res->assertJsonPath('data.assigned_to', $assignee->staff_id);
        $res->assertJsonPath('data.assignee.staff_id', $assignee->staff_id);
    }
}
