<?php

namespace Tests\Unit;

use App\Services\ReportGenerationService;
use App\Services\ReportNumberGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

class ReportGenerationServiceTest extends TestCase
{
    use RefreshDatabase;

    private function sampleStatusCol(): string
    {
        return Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';
    }

    private function qcPassAttrs(): array
    {
        if (Schema::hasColumn('sample_tests', 'qc_done')) {
            return ['qc_done' => true];
        }
        if (Schema::hasColumn('sample_tests', 'qc_summary_status')) {
            return ['qc_summary_status' => 'pass'];
        }
        if (Schema::hasColumn('sample_tests', 'qc_status')) {
            return ['qc_status' => 'pass'];
        }
        return [];
    }

    private function qcFailAttrs(): array
    {
        if (Schema::hasColumn('sample_tests', 'qc_done')) {
            return ['qc_done' => false];
        }
        if (Schema::hasColumn('sample_tests', 'qc_summary_status')) {
            return ['qc_summary_status' => 'fail'];
        }
        if (Schema::hasColumn('sample_tests', 'qc_status')) {
            return ['qc_status' => 'fail'];
        }
        return [];
    }

    private function withTimestamps(string $table, array $data): array
    {
        // ✅ hanya tambahkan timestamps kalau kolomnya ada di table
        if (Schema::hasColumn($table, 'created_at') && !array_key_exists('created_at', $data)) {
            $data['created_at'] = now();
        }
        if (Schema::hasColumn($table, 'updated_at') && !array_key_exists('updated_at', $data)) {
            $data['updated_at'] = now();
        }
        return $data;
    }

    public function test_generates_report_with_items_and_signature_slots(): void
    {
        $this->seed();

        $adminStaffId = (int) DB::table('staffs')->min('staff_id');

        $clientId = DB::table('clients')->insertGetId(
            $this->withTimestamps('clients', [
                'staff_id' => null,
                'type' => 'individual',
                'name' => 'Test Client',
                'phone' => '0800000000',
                'email' => 'testclient@example.com',
                'password_hash' => bcrypt('password'),
                'is_active' => true,
            ]),
            'client_id'
        );

        $statusCol = $this->sampleStatusCol();

        $sampleId = DB::table('samples')->insertGetId(
            $this->withTimestamps('samples', [
                'client_id' => $clientId,
                'received_at' => now(),
                'sample_type' => 'swab',
                'examination_purpose' => 'testing',
                'contact_history' => null,
                'priority' => 1,
                // ✅ harus validated agar lolos gate
                $statusCol => 'validated',
                'additional_notes' => null,
                'created_by' => $adminStaffId,
                'assigned_to' => $adminStaffId,
            ]),
            'sample_id'
        );

        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');
        $unitId = (int) DB::table('units')->min('unit_id');

        $sampleTestId = DB::table('sample_tests')->insertGetId(
            $this->withTimestamps('sample_tests', array_merge([
                'sample_id' => $sampleId,
                'parameter_id' => $parameterId,
                'method_id' => $methodId,
                'assigned_to' => $adminStaffId,
                // ✅ batch_id wajib (1 sample = 1 batch)
                'batch_id' => $sampleId,
                'status' => 'validated',
                'om_verified' => true,
                'lh_validated' => true,
                'completed_at' => now(),
            ], $this->qcPassAttrs())),
            'sample_test_id'
        );

        DB::table('test_results')->insert(
            $this->withTimestamps('test_results', [
                'sample_test_id' => $sampleTestId,
                'created_by' => $adminStaffId,
                'raw_data' => json_encode(['raw' => 12.34]),
                'calc_data' => json_encode(['calc' => 12.34]),
                'interpretation' => 'normal',
                'version_no' => 1,
                'value_raw' => 12.34,
                'value_final' => 12.34,
                'unit_id' => $unitId,
                'flags' => json_encode(['ok']),
            ])
        );

        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            $this->withTimestamps('report_counters', ['next_seq' => 1])
        );

        $svc = new ReportGenerationService();
        $report = $svc->generateForSample($sampleId, $adminStaffId);

        $this->assertNotNull($report->report_id);
        $this->assertEquals($sampleId, (int) $report->sample_id);

        $itemsCount = DB::table('report_items')
            ->where('report_id', $report->report_id)
            ->count();
        $this->assertEquals(1, $itemsCount);

        $signCount = DB::table('report_signatures')
            ->where('report_id', $report->report_id)
            ->count();
        $this->assertEquals(2, $signCount);

        $this->assertStringEndsWith('/UNSRAT-BML', (string) $report->report_no);
    }

    public function test_rejects_generation_if_any_test_not_validated(): void
    {
        $this->seed();

        $adminStaffId = (int) DB::table('staffs')->min('staff_id');

        $clientId = DB::table('clients')->insertGetId(
            $this->withTimestamps('clients', [
                'staff_id' => null,
                'type' => 'individual',
                'name' => 'Test Client 2',
                'phone' => '0800000001',
                'email' => 'testclient2@example.com',
                'password_hash' => bcrypt('password'),
                'is_active' => true,
            ]),
            'client_id'
        );

        $statusCol = $this->sampleStatusCol();

        $sampleId = DB::table('samples')->insertGetId(
            $this->withTimestamps('samples', [
                'client_id' => $clientId,
                'received_at' => now(),
                'sample_type' => 'swab',
                'examination_purpose' => 'testing',
                'contact_history' => null,
                'priority' => 1,
                // ✅ lolos gate sample status dulu
                $statusCol => 'validated',
                'additional_notes' => null,
                'created_by' => $adminStaffId,
                'assigned_to' => $adminStaffId,
            ]),
            'sample_id'
        );

        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');

        DB::table('sample_tests')->insert(
            $this->withTimestamps('sample_tests', array_merge([
                'sample_id' => $sampleId,
                'parameter_id' => $parameterId,
                'method_id' => $methodId,
                'assigned_to' => $adminStaffId,
                'batch_id' => $sampleId,
                // ❌ not validated
                'status' => 'measured',
                'om_verified' => false,
                'lh_validated' => false,
            ], $this->qcPassAttrs()))
        );

        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            $this->withTimestamps('report_counters', ['next_seq' => 1])
        );

        $svc = new ReportGenerationService();

        $this->expectException(ConflictHttpException::class);
        $this->expectExceptionMessage('Semua sample tests harus "validated"');

        $svc->generateForSample($sampleId, $adminStaffId);
    }

    public function test_rejects_generation_if_sample_not_validated(): void
    {
        $this->seed();

        $adminStaffId = (int) DB::table('staffs')->min('staff_id');

        $clientId = DB::table('clients')->insertGetId(
            $this->withTimestamps('clients', [
                'staff_id' => null,
                'type' => 'individual',
                'name' => 'Test Client 3',
                'phone' => '0800000002',
                'email' => 'testclient3@example.com',
                'password_hash' => bcrypt('password'),
                'is_active' => true,
            ]),
            'client_id'
        );

        $statusCol = $this->sampleStatusCol();

        $sampleId = DB::table('samples')->insertGetId(
            $this->withTimestamps('samples', [
                'client_id' => $clientId,
                'received_at' => now(),
                'sample_type' => 'swab',
                'examination_purpose' => 'testing',
                'contact_history' => null,
                'priority' => 1,
                // ❌ bukan validated
                $statusCol => 'verified',
                'additional_notes' => null,
                'created_by' => $adminStaffId,
                'assigned_to' => $adminStaffId,
            ]),
            'sample_id'
        );

        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');

        DB::table('sample_tests')->insert(
            $this->withTimestamps('sample_tests', array_merge([
                'sample_id' => $sampleId,
                'parameter_id' => $parameterId,
                'method_id' => $methodId,
                'assigned_to' => $adminStaffId,
                'batch_id' => $sampleId,
                'status' => 'validated',
                'om_verified' => true,
                'lh_validated' => true,
            ], $this->qcPassAttrs()))
        );

        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            $this->withTimestamps('report_counters', ['next_seq' => 1])
        );

        $svc = new ReportGenerationService();

        $this->expectException(ConflictHttpException::class);
        $this->expectExceptionMessage('Status sample harus "validated"');

        $svc->generateForSample($sampleId, $adminStaffId);
    }

    public function test_rejects_generation_if_qc_not_pass(): void
    {
        $this->seed();

        if (empty($this->qcPassAttrs()) && empty($this->qcFailAttrs())) {
            $this->markTestSkipped('QC field not present in sample_tests schema.');
        }

        $adminStaffId = (int) DB::table('staffs')->min('staff_id');

        $clientId = DB::table('clients')->insertGetId(
            $this->withTimestamps('clients', [
                'staff_id' => null,
                'type' => 'individual',
                'name' => 'Test Client 4',
                'phone' => '0800000003',
                'email' => 'testclient4@example.com',
                'password_hash' => bcrypt('password'),
                'is_active' => true,
            ]),
            'client_id'
        );

        $statusCol = $this->sampleStatusCol();

        $sampleId = DB::table('samples')->insertGetId(
            $this->withTimestamps('samples', [
                'client_id' => $clientId,
                'received_at' => now(),
                'sample_type' => 'swab',
                'examination_purpose' => 'testing',
                'contact_history' => null,
                'priority' => 1,
                // ✅ validated agar lewat gate sample
                $statusCol => 'validated',
                'additional_notes' => null,
                'created_by' => $adminStaffId,
                'assigned_to' => $adminStaffId,
            ]),
            'sample_id'
        );

        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');

        DB::table('sample_tests')->insert(
            $this->withTimestamps('sample_tests', array_merge([
                'sample_id' => $sampleId,
                'parameter_id' => $parameterId,
                'method_id' => $methodId,
                'assigned_to' => $adminStaffId,
                'batch_id' => $sampleId,
                'status' => 'validated',
                'om_verified' => true,
                'lh_validated' => true,
            ], $this->qcFailAttrs()))
        );

        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            $this->withTimestamps('report_counters', ['next_seq' => 1])
        );

        $svc = new ReportGenerationService();

        $this->expectException(ConflictHttpException::class);
        $this->expectExceptionMessage('QC harus PASS');

        $svc->generateForSample($sampleId, $adminStaffId);
    }
}
