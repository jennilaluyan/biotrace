<?php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SampleIntakeValidateApiTest extends TestCase
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

    /**
     * Create sample row with request_status physically_received, and received_at NULL
     * so we can assert Step 6 sets received_at.
     */
    private function createSamplePhysicallyReceived(int $staffId, ?string $requestStatus = 'physically_received'): int
    {
        $clientId = $this->createClientId();

        $payload = [
            'client_id'      => $clientId,
            'request_status' => $requestStatus,
            'submitted_at'   => now(),
            'physically_received_at' => now(),
            'current_status' => 'received',
            'received_at'    => null, // intentionally null for Step 6
            'sample_type'    => 'routine',
            'priority'       => 0,
            'created_by'     => $staffId,
            'assigned_to'    => $staffId,
            'created_at'     => now(),
            'updated_at'     => now(),
            'lab_sample_code' => null,
        ];

        $cols = array_flip(Schema::getColumnListing('samples'));
        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    private function insertChecklist(int $sampleId, int $staffId, bool $isPassed): void
    {
        $payload = [
            'sample_id'  => $sampleId,
            'checklist'  => json_encode([
                'container_intact' => $isPassed ? true : true,
                'label_clear'      => $isPassed ? true : false,
                'volume_ok'        => true,
            ]),
            'notes'      => $isPassed ? 'OK' : 'Label missing',
            'is_passed'  => $isPassed,
            'checked_by' => $staffId,
            'checked_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('sample_intake_checklists'));
        DB::table('sample_intake_checklists')->insert(array_intersect_key($payload, $cols));
    }

    private function ensureSequenceExistsAndReset(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement("CREATE SEQUENCE IF NOT EXISTS lab_sample_code_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;");
        // reset to 1, and mark "not called yet", so first nextval -> 1
        DB::statement("SELECT setval('lab_sample_code_seq', 1, false);");
    }

    private function getSequenceLastValue(): ?int
    {
        if (DB::getDriverName() !== 'pgsql') return null;

        // Does not advance sequence
        $row = DB::selectOne("SELECT last_value, is_called FROM lab_sample_code_seq");
        return isset($row->last_value) ? (int) $row->last_value : null;
    }

    public function test_lab_head_can_validate_intake_after_checklist_pass_and_assigns_bml_code(): void
    {
        $this->ensureSequenceExistsAndReset();

        $lh = $this->createStaff('Laboratory Head', 'lh_' . uniqid() . '@test.local');
        Sanctum::actingAs($lh, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'physically_received');
        $this->insertChecklist($sampleId, (int) $lh->staff_id, true);

        $res = $this->postJson("/api/v1/samples/{$sampleId}/intake-validate");

        $res->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'lab_sample_code' => 'BML-001',
        ]);

        // received_at should be set by validation (if your Step 6 does that)
        $receivedAt = DB::table('samples')->where('sample_id', $sampleId)->value('received_at');
        $this->assertNotNull($receivedAt, 'Expected received_at to be set by intake validation.');

        // audit logs
        $this->assertTrue(
            DB::table('audit_logs')
                ->where('entity_name', 'samples')
                ->where('entity_id', $sampleId)
                ->where('action', 'SAMPLE_INTAKE_VALIDATED')
                ->exists(),
            'Expected audit log SAMPLE_INTAKE_VALIDATED was not found.'
        );

        $this->assertTrue(
            DB::table('audit_logs')
                ->where('entity_name', 'samples')
                ->where('entity_id', $sampleId)
                ->where('action', 'LAB_SAMPLE_CODE_ASSIGNED')
                ->exists(),
            'Expected audit log LAB_SAMPLE_CODE_ASSIGNED was not found.'
        );
    }

    public function test_lab_head_cannot_validate_when_checklist_missing(): void
    {
        $this->ensureSequenceExistsAndReset();

        $lh = $this->createStaff('Laboratory Head', 'lh_missing_' . uniqid() . '@test.local');
        Sanctum::actingAs($lh, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'physically_received');

        $this->postJson("/api/v1/samples/{$sampleId}/intake-validate")
            ->assertStatus(422);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'lab_sample_code' => null,
        ]);
    }

    public function test_lab_head_cannot_validate_when_checklist_failed(): void
    {
        $this->ensureSequenceExistsAndReset();

        $lh = $this->createStaff('Laboratory Head', 'lh_fail_' . uniqid() . '@test.local');
        Sanctum::actingAs($lh, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'physically_received');
        $this->insertChecklist($sampleId, (int) $lh->staff_id, false);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-validate")
            ->assertStatus(422);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'lab_sample_code' => null,
        ]);
    }

    public function test_lab_head_cannot_validate_when_not_physically_received(): void
    {
        $this->ensureSequenceExistsAndReset();

        $lh = $this->createStaff('Laboratory Head', 'lh_not_pr_' . uniqid() . '@test.local');
        Sanctum::actingAs($lh, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'submitted');
        $this->insertChecklist($sampleId, (int) $lh->staff_id, true);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-validate")
            ->assertStatus(422);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'lab_sample_code' => null,
        ]);
    }

    public function test_validate_is_idempotent_and_does_not_advance_sequence_on_second_call(): void
    {
        $this->ensureSequenceExistsAndReset();

        $lh = $this->createStaff('Laboratory Head', 'lh_idem_' . uniqid() . '@test.local');
        Sanctum::actingAs($lh, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'physically_received');
        $this->insertChecklist($sampleId, (int) $lh->staff_id, true);

        // first validate -> BML-001
        $this->postJson("/api/v1/samples/{$sampleId}/intake-validate")
            ->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'lab_sample_code' => 'BML-001',
        ]);

        $seqAfterFirst = $this->getSequenceLastValue();

        // second validate -> still BML-001 (no change)
        $this->postJson("/api/v1/samples/{$sampleId}/intake-validate")
            ->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $sampleId,
            'lab_sample_code' => 'BML-001',
        ]);

        $seqAfterSecond = $this->getSequenceLastValue();

        if (DB::getDriverName() === 'pgsql') {
            $this->assertSame($seqAfterFirst, $seqAfterSecond, 'Expected sequence not to advance on idempotent second validation.');
        }
    }

    public function test_two_samples_get_sequential_codes(): void
    {
        $this->ensureSequenceExistsAndReset();

        $lh = $this->createStaff('Laboratory Head', 'lh_seq_' . uniqid() . '@test.local');
        Sanctum::actingAs($lh, ['*']);

        $s1 = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'physically_received');
        $this->insertChecklist($s1, (int) $lh->staff_id, true);

        $s2 = $this->createSamplePhysicallyReceived((int) $lh->staff_id, 'physically_received');
        $this->insertChecklist($s2, (int) $lh->staff_id, true);

        $this->postJson("/api/v1/samples/{$s1}/intake-validate")
            ->assertStatus(200);

        $this->postJson("/api/v1/samples/{$s2}/intake-validate")
            ->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $s1,
            'lab_sample_code' => 'BML-001',
        ]);

        $this->assertDatabaseHas('samples', [
            'sample_id' => $s2,
            'lab_sample_code' => 'BML-002',
        ]);
    }

    public function test_forbidden_for_non_lab_head(): void
    {
        $this->ensureSequenceExistsAndReset();

        $admin = $this->createStaff('Administrator', 'admin_lh_forbid_' . uniqid() . '@test.local');
        Sanctum::actingAs($admin, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $admin->staff_id, 'physically_received');
        $this->insertChecklist($sampleId, (int) $admin->staff_id, true);

        $this->postJson("/api/v1/samples/{$sampleId}/intake-validate")
            ->assertStatus(403);
    }
}
