<?php
// backend/tests/Unit/QcEvaluationServiceTest.php

namespace Tests\Unit;

use App\Models\QcControl;
use App\Models\QcRun;
use App\Models\Staff;
use App\Services\QcEvaluationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class QcEvaluationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_1_2s_is_warning(): void
    {
        $this->ensureRoleExists(4, 'Analyst');
        $actor = Staff::factory()->create([
            'role_id' => 4,
            'is_active' => true,
        ]);

        $parameterId = $this->createParameter(createdBy: (int) $actor->staff_id);
        $qcControlId = $this->createQcControl(parameterId: $parameterId, ruleset: ['1-2s', '1-3s'], target: 0.0, tolerance: 1.0);

        $svc = new QcEvaluationService();

        $batchId = 1001;
        $run = $svc->evaluateAndPersist($batchId, $qcControlId, 2.1, (int) $actor->staff_id);

        $this->assertSame('warning', $run->status);
        $this->assertIsArray($run->violations);
        $this->assertContains('1-2s', $run->violations);
    }

    public function test_1_3s_is_fail(): void
    {
        $this->ensureRoleExists(4, 'Analyst');
        $actor = Staff::factory()->create([
            'role_id' => 4,
            'is_active' => true,
        ]);

        $parameterId = $this->createParameter(createdBy: (int) $actor->staff_id);
        $qcControlId = $this->createQcControl(parameterId: $parameterId, ruleset: ['1-2s', '1-3s'], target: 0.0, tolerance: 1.0);

        $svc = new QcEvaluationService();

        $batchId = 1002;
        $run = $svc->evaluateAndPersist($batchId, $qcControlId, 3.1, (int) $actor->staff_id);

        $this->assertSame('fail', $run->status);
        $this->assertIsArray($run->violations);
        $this->assertContains('1-3s', $run->violations);
    }

    public function test_r_4s_is_fail(): void
    {
        $this->ensureRoleExists(4, 'Analyst');
        $actor = Staff::factory()->create([
            'role_id' => 4,
            'is_active' => true,
        ]);

        $parameterId = $this->createParameter(createdBy: (int) $actor->staff_id);
        $qcControlId = $this->createQcControl(parameterId: $parameterId, ruleset: ['1-2s', '1-3s', 'R-4s'], target: 0.0, tolerance: 1.0);

        $svc = new QcEvaluationService();

        $batchId = 1003;

        // Run 1: z=2.1 (warning)
        $run1 = $svc->evaluateAndPersist($batchId, $qcControlId, 2.1, (int) $actor->staff_id);

        // Run 2: z=-2.2 => diff abs(2.1 - (-2.2)) = 4.3 > 4 => R-4s fail for both latest 2
        $run2 = $svc->evaluateAndPersist($batchId, $qcControlId, -2.2, (int) $actor->staff_id);

        $run1Fresh = QcRun::query()->findOrFail($run1->qc_run_id);
        $run2Fresh = QcRun::query()->findOrFail($run2->qc_run_id);

        $this->assertSame('fail', $run1Fresh->status);
        $this->assertSame('fail', $run2Fresh->status);

        $this->assertIsArray($run1Fresh->violations);
        $this->assertIsArray($run2Fresh->violations);

        $this->assertContains('R-4s', $run1Fresh->violations);
        $this->assertContains('R-4s', $run2Fresh->violations);
    }

    /* ------------------------------ Helpers ------------------------------ */

    private function ensureRoleExists(int $roleId, string $name): void
    {
        if (!Schema::hasTable('roles')) {
            return;
        }

        $exists = DB::table('roles')->where('role_id', $roleId)->exists();
        if ($exists) {
            return;
        }

        $cols = Schema::getColumnListing('roles');
        $row = [];

        if (in_array('role_id', $cols, true)) {
            $row['role_id'] = $roleId;
        }
        if (in_array('name', $cols, true)) {
            $row['name'] = $name;
        }
        if (in_array('created_at', $cols, true)) {
            $row['created_at'] = now();
        }
        if (in_array('updated_at', $cols, true)) {
            $row['updated_at'] = now();
        }

        DB::table('roles')->insert($row);
    }

    private function createParameter(int $createdBy): int
    {
        $cols = Schema::getColumnListing('parameters');

        $row = [
            'code' => 'QC-P-' . Str::upper(Str::random(6)),
            'name' => 'QC Parameter ' . Str::random(6),
            // sesuai migration kamu: unit + method_ref wajib, status/tag check constraint
            'unit' => 'mg/dL',
            'method_ref' => 'WHO',
            'created_by' => $createdBy,
            'status' => 'Active',
            'tag' => 'Routine',
            'created_at' => now(),
            'updated_at' => now(),
        ];

        // kalau ada unit_id (nullable) biarkan null
        if (in_array('unit_id', $cols, true)) {
            $row['unit_id'] = null;
        }

        // filter hanya kolom yang memang ada
        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('parameters')->insertGetId($row, 'parameter_id');
    }

    private function createQcControl(int $parameterId, array $ruleset, float $target, float $tolerance): int
    {
        $cols = Schema::getColumnListing('qc_controls');

        $row = [
            'parameter_id' => $parameterId,
            'control_type' => 'control_material',
            'target' => $target,
            'tolerance' => $tolerance,
            'ruleset' => json_encode(array_values($ruleset)),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        // beberapa schema punya method_id (nullable). Kalau ada, set null.
        if (in_array('method_id', $cols, true)) {
            $row['method_id'] = null;
        }

        // beberapa schema punya note
        if (in_array('note', $cols, true)) {
            $row['note'] = null;
        }

        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('qc_controls')->insertGetId($row, 'qc_control_id');
    }
}
