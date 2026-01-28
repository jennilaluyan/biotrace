<?php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SampleIntakeChecklistApiTest extends TestCase
{
    use RefreshDatabase;

    private function ensureRole(string $name): int
    {
        $existing = DB::table('roles')->where('name', $name)->value('role_id');
        if ($existing) return (int) $existing;

        return (int) DB::table('roles')->insertGetId([
            'name'        => $name,
            'description' => 'Auto role for tests',
            'created_at'  => now(),
            'updated_at'  => now(),
        ], 'role_id');
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
        DB::table('staffs')->insert(array_intersect_key($payload, $cols));

        $id = (int) DB::table('staffs')->where('email', $email)->value('staff_id');
        return Staff::query()->findOrFail($id);
    }

    private function createClientId(): int
    {
        $payload = [
            'type'          => 'individual',
            'name'          => 'Test Client',
            'email'         => 'client_' . uniqid() . '@test.local',
            'phone'         => '081234567890',
            'password_hash' => bcrypt('password'),
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('clients'));
        DB::table('clients')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('clients')->orderByDesc('client_id')->value('client_id');
    }

    private function createSamplePhysicallyReceived(int $staffId): int
    {
        $clientId = $this->createClientId();

        $payload = [
            'client_id'      => $clientId,
            'request_status' => 'physically_received',
            'submitted_at'   => now(),
            'physically_received_at' => now(),
            'current_status' => 'received',
            'received_at'    => now(),
            'sample_type'    => 'routine',
            'priority'       => 0,
            'created_by'     => $staffId,
            'assigned_to'    => $staffId,
            'created_at'     => now(),
            'updated_at'     => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('samples'));
        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    public function test_sample_collector_can_submit_checklist_only_when_physically_received(): void
    {
        $sc = $this->createStaff('Sample Collector', 'sc_' . uniqid() . '@test.local');
        Sanctum::actingAs($sc, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $sc->staff_id);

        $res = $this->postJson("/api/v1/samples/{$sampleId}/intake-checklist", [
            'checks' => [
                'sample_physical_condition' => true,
                'volume' => true,
                'identity' => true,
                'packing' => true,
                'supporting_documents' => true,
            ],
            'note' => 'All good',
        ]);

        $res->assertStatus(201);

        $res->assertJsonPath('data.request_status', 'awaiting_verification');
        $res->assertJsonPath('data.lab_sample_code', null);

        $this->assertDatabaseHas('sample_intake_checklists', [
            'sample_id' => $sampleId,
            'is_passed' => true,
        ]);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'request_status' => 'physically_received',
        ]);

        $this->assertTrue(
            DB::table('audit_logs')
                ->where('entity_name', 'samples')
                ->where('entity_id', $sampleId)
                ->where('action', 'SAMPLE_INTAKE_CHECKLIST_SUBMITTED')
                ->exists()
        );
    }

    public function test_any_fail_marks_intake_failed_and_returns_request_status(): void
    {
        $sc = $this->createStaff('Sample Collector', 'sc_fail_' . uniqid() . '@test.local');
        Sanctum::actingAs($sc, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $sc->staff_id);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-checklist", [
            'checks' => [
                'sample_physical_condition' => false, // fail
                'volume' => true,
                'identity' => true,
                'packing' => true,
                'supporting_documents' => true,
            ],
            'notes' => [
                'sample_physical_condition' => 'Wadah/label/tutup tidak sesuai.',
            ],
            'note' => 'Physical condition failed',
        ])->assertStatus(201);

        $this->assertDatabaseHas('sample_intake_checklists', [
            'sample_id' => $sampleId,
            'is_passed' => false,
        ]);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'request_status' => 'returned',
        ]);

        $this->assertTrue(
            DB::table('audit_logs')
                ->where('entity_name', 'samples')
                ->where('entity_id', $sampleId)
                ->where('action', 'SAMPLE_INTAKE_FAILED')
                ->exists()
        );
    }

    public function test_forbidden_for_non_sample_collector(): void
    {
        $admin = $this->createStaff('Administrator', 'admin_' . uniqid() . '@test.local');
        Sanctum::actingAs($admin, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $admin->staff_id);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-checklist", [
            'checklist' => ['x' => true],
        ])->assertStatus(403);
    }

    public function test_cannot_submit_when_not_physically_received(): void
    {
        $sc = $this->createStaff('Sample Collector', 'sc_nr_' . uniqid() . '@test.local');
        Sanctum::actingAs($sc, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $sc->staff_id);
        DB::table('samples')->where('sample_id', $sampleId)->update(['request_status' => 'submitted']);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-checklist", [
            'checklist' => ['x' => true],
        ])->assertStatus(422);
    }

    public function test_cannot_submit_twice(): void
    {
        $sc = $this->createStaff('Sample Collector', 'sc_twice_' . uniqid() . '@test.local');
        Sanctum::actingAs($sc, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $sc->staff_id);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-checklist", [
            'checks' => [
                'sample_physical_condition' => true,
                'volume' => true,
                'identity' => true,
                'packing' => true,
                'supporting_documents' => true,
            ],
        ])->assertStatus(201);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-checklist", [
            'checklist' => ['x' => true],
        ])->assertStatus(409);
    }
}
