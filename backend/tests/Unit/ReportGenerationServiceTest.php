<?php

namespace Tests\Unit;

use App\Services\ReportGenerationService;
use App\Services\ReportNumberGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReportGenerationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_generates_report_with_items_and_signature_slots(): void
    {
        $this->seed();

        $adminStaffId = (int) DB::table('staffs')->min('staff_id');

        $clientId = DB::table('clients')->insertGetId([
            'staff_id' => null,
            'type' => 'individual',
            'name' => 'Test Client',
            'phone' => '0800000000',
            'email' => 'testclient@example.com',
            'password_hash' => bcrypt('password'),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'client_id');

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'contact_history' => null,
            'priority' => 1,
            'current_status' => 'received',
            'additional_notes' => null,
            'created_by' => $adminStaffId,
            'assigned_to' => $adminStaffId,
        ], 'sample_id');

        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');
        $unitId = (int) DB::table('units')->min('unit_id');

        $sampleTestId = DB::table('sample_tests')->insertGetId([
            'sample_id' => $sampleId,
            'parameter_id' => $parameterId,
            'method_id' => $methodId,
            'assigned_to' => $adminStaffId,

            // ✅ batch_id wajib (1 sample = 1 batch)
            'batch_id' => $sampleId,

            'status' => 'validated',
            'qc_done' => true,
            'om_verified' => true,
            'lh_validated' => true,
            'completed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ], 'sample_test_id');

        DB::table('test_results')->insert([
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
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            ['next_seq' => 1, 'updated_at' => now()]
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

        $clientId = DB::table('clients')->insertGetId([
            'staff_id' => null,
            'type' => 'individual',
            'name' => 'Test Client 2',
            'phone' => '0800000001',
            'email' => 'testclient2@example.com',
            'password_hash' => bcrypt('password'),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'client_id');

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'contact_history' => null,
            'priority' => 1,
            'current_status' => 'received',
            'additional_notes' => null,
            'created_by' => $adminStaffId,
            'assigned_to' => $adminStaffId,
        ], 'sample_id');

        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');

        DB::table('sample_tests')->insert([
            'sample_id' => $sampleId,
            'parameter_id' => $parameterId,
            'method_id' => $methodId,
            'assigned_to' => $adminStaffId,

            // ✅ batch_id wajib
            'batch_id' => $sampleId,

            'status' => 'measured',
            'qc_done' => true,
            'om_verified' => false,
            'lh_validated' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            ['next_seq' => 1, 'updated_at' => now()]
        );

        $svc = new ReportGenerationService();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('all tests must be validated');

        $svc->generateForSample($sampleId, $adminStaffId);
    }
}
