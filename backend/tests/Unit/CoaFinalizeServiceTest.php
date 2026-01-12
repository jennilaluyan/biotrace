<?php

namespace Tests\Unit;

use App\Services\CoaFinalizeService;
use App\Services\ReportGenerationService;
use App\Services\ReportNumberGenerator;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class CoaFinalizeServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_finalize_coa_writes_pdf_locks_report_and_sets_sample_reported(): void
    {
        $this->seed();

        // ===== storage & config =====
        Storage::fake('local');
        config()->set('coa.storage_disk', 'local');
        config()->set('coa.lh_signature.disk', 'local');
        config()->set('coa.lh_signature.path', 'signatures/lh.png');

        // dummy signature
        Storage::disk('local')->put(
            'signatures/lh.png',
            base64_decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axwY1sAAAAASUVORK5CYII='
            )
        );

        // ===== mock dompdf =====
        $pdfMock = Mockery::mock(\Barryvdh\DomPDF\PDF::class);
        $pdfMock->shouldReceive('setPaper')->andReturnSelf();
        $pdfMock->shouldReceive('output')->andReturn('%PDF-FAKE%');
        Pdf::shouldReceive('loadView')->andReturn($pdfMock);

        // ===== ids =====
        $adminStaffId = (int) DB::table('staffs')->min('staff_id');
        $lhStaffId = (int) (DB::table('staffs')->where('role_id', 6)->min('staff_id') ?: $adminStaffId);

        // ===== client =====
        $clientId = DB::table('clients')->insertGetId([
            'staff_id' => null,
            'type' => 'institution',
            'name' => 'Institusi Test',
            'phone' => '0800000000',
            'email' => 'inst@example.com',
            'password_hash' => bcrypt('password'),
            'is_active' => true,
        ], 'client_id');

        // ===== sample =====
        $statusCol = Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'priority' => 1,
            $statusCol => 'validated',
            'created_by' => $adminStaffId,
            'assigned_to' => $adminStaffId,
        ], 'sample_id');

        // ===== sample test =====
        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId = (int) DB::table('methods')->min('method_id');
        $unitId = (int) DB::table('units')->min('unit_id');

        $sampleTestId = DB::table('sample_tests')->insertGetId([
            'sample_id' => $sampleId,
            'parameter_id' => $parameterId,
            'method_id' => $methodId,
            'assigned_to' => $adminStaffId,
            'batch_id' => $sampleId,
            'status' => 'validated',
            'qc_done' => true,
            'om_verified' => true,
            'lh_validated' => true,
        ], 'sample_test_id');

        DB::table('test_results')->insert([
            'sample_test_id' => $sampleTestId,
            'created_by' => $adminStaffId,

            // WAJIB sesuai schema
            'raw_data' => json_encode(['raw' => 12.3]),
            'calc_data' => json_encode(['final' => 12.3]),
            'interpretation' => 'normal',
            'version_no' => 1,

            'value_raw' => 12.3,
            'value_final' => 12.3,
            'unit_id' => $unitId,
            'flags' => json_encode([]),

            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // ===== report counter =====
        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            ['next_seq' => 1]
        );

        // ===== generate draft report =====
        $gen = app(ReportGenerationService::class);
        $report = $gen->generateForSample($sampleId, $adminStaffId);

        if (Schema::hasColumn('reports', 'report_type')) {
            DB::table('reports')
                ->where('report_id', $report->report_id)
                ->update(['report_type' => 'coa']);
        }

        // ===== finalize =====
        $svc = app(CoaFinalizeService::class);
        $result = $svc->finalize((int) $report->report_id, $lhStaffId, 'INST_V1');

        // ===== asserts =====
        $this->assertEquals((int) $report->report_id, (int) $result['report_id']);
        $this->assertEquals('INST_V1', $result['template_code']);

        $row = DB::table('reports')->where('report_id', $report->report_id)->first();
        $this->assertTrue((bool) $row->is_locked);
        $this->assertNotEmpty($row->pdf_url);

        $this->assertTrue(
            Storage::disk('local')->exists($row->pdf_url),
            'Expected FINAL CoA PDF to exist'
        );

        $sample = DB::table('samples')->where('sample_id', $sampleId)->first();
        $this->assertEquals('reported', (string) $sample->{$statusCol});

        $sig = DB::table('report_signatures')
            ->where('report_id', $report->report_id)
            ->where('role_code', 'LH')
            ->first();

        $this->assertNotNull($sig);
        $this->assertNotNull($sig->signed_at);
    }

    public function test_finalize_is_idempotent_and_rejects_second_finalize(): void
    {
        $this->seed();

        Storage::fake('local');
        config()->set('coa.storage_disk', 'local');
        config()->set('coa.lh_signature.disk', 'local');
        config()->set('coa.lh_signature.path', 'signatures/lh.png');
        Storage::disk('local')->put('signatures/lh.png', 'fake');

        $pdfMock = Mockery::mock(\Barryvdh\DomPDF\PDF::class);
        $pdfMock->shouldReceive('setPaper')->andReturnSelf();
        $pdfMock->shouldReceive('output')->andReturn('%PDF-FAKE%');
        Pdf::shouldReceive('loadView')->andReturn($pdfMock);

        $adminStaffId = (int) DB::table('staffs')->min('staff_id');
        $lhStaffId = (int) (DB::table('staffs')->where('role_id', 6)->min('staff_id') ?: $adminStaffId);

        $clientId = DB::table('clients')->insertGetId([
            'staff_id' => null,
            'type' => 'individual',
            'name' => 'Individu Test',
            'phone' => '0800000001',
            'email' => 'ind@example.com',
            'password_hash' => bcrypt('password'),
            'is_active' => true,
        ], 'client_id');

        $statusCol = Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'priority' => 1,
            $statusCol => 'validated',
            'created_by' => $adminStaffId,
            'assigned_to' => $adminStaffId,
        ], 'sample_id');

        $reportId = DB::table('reports')->insertGetId([
            'sample_id' => $sampleId,
            'report_no' => '00001/CoA/UNSRAT-BML',
            'generated_at' => now(),
            'generated_by' => $adminStaffId,
            'pdf_url' => 'reports/coa/draft/00001-CoA-UNSRAT-BML.pdf',
            'is_locked' => false,
        ], 'report_id');

        if (Schema::hasColumn('reports', 'report_type')) {
            DB::table('reports')->where('report_id', $reportId)->update(['report_type' => 'coa']);
        }

        $svc = app(CoaFinalizeService::class);
        $svc->finalize($reportId, $lhStaffId, null);

        $this->expectException(ConflictHttpException::class);
        $svc->finalize($reportId, $lhStaffId, null);
    }
}
