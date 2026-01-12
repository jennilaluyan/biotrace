<?php

namespace Tests\Feature;

use App\Actions\AutoCreateCoaAfterValidation;
use App\Services\ReportNumberGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AutoCreateCoaOnValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_auto_creates_coa_after_last_lh_validation(): void
    {
        $this->seed();

        // ambil LH
        $lhId = (int) (
            DB::table('staffs')->where('role_id', 6)->min('staff_id')
            ?: DB::table('staffs')->min('staff_id')
        );

        // client
        $clientId = DB::table('clients')->insertGetId([
            'type' => 'individual',
            'name' => 'Client Test',
            'email' => 'client@test.local',
            'phone' => '0800000000',
            'password_hash' => bcrypt('secret'),
            'is_active' => true,
            'created_at' => now(),
        ], 'client_id');

        // sample
        $statusCol = Schema::hasColumn('samples', 'current_status')
            ? 'current_status'
            : 'status';

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'priority' => 1,
            $statusCol => 'validated',
            'created_by' => $lhId,
            'assigned_to' => $lhId,
        ], 'sample_id');

        // parameter + method
        $parameterId = (int) DB::table('parameters')->min('parameter_id');
        $methodId    = (int) DB::table('methods')->min('method_id');

        // sample test (validated + QC PASS)
        DB::table('sample_tests')->insert([
            'sample_id' => $sampleId,
            'parameter_id' => $parameterId,
            'method_id' => $methodId,
            'assigned_to' => $lhId,
            'batch_id' => $sampleId,
            'status' => 'validated',
            'qc_done' => true,
            'om_verified' => true,
            'lh_validated' => true,
            'created_at' => now(),
        ]);

        // counter report
        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            ['next_seq' => 1, 'updated_at' => now()]
        );

        // ACTION
        app(AutoCreateCoaAfterValidation::class)
            ->handle($sampleId, $lhId);

        // ASSERT
        $this->assertDatabaseHas('reports', [
            'sample_id' => $sampleId,
        ]);
    }

    public function test_does_not_duplicate_existing_coa(): void
    {
        $this->seed();

        $staffId = (int) DB::table('staffs')->min('staff_id');

        // client
        $clientId = DB::table('clients')->insertGetId([
            'type' => 'individual',
            'name' => 'Client Dup',
            'email' => 'dup@test.local',
            'phone' => '0800000001',
            'password_hash' => bcrypt('secret'),
            'is_active' => true,
            'created_at' => now(),
        ], 'client_id');

        $statusCol = Schema::hasColumn('samples', 'current_status')
            ? 'current_status'
            : 'status';

        // sample
        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'priority' => 1,
            $statusCol => 'validated',
            'created_by' => $staffId,
            'assigned_to' => $staffId,
        ], 'sample_id');

        // EXISTING CoA
        DB::table('reports')->insert([
            'sample_id' => $sampleId,
            'report_no' => 'DUMMY',
            'generated_at' => now(),
            'generated_by' => $staffId,
            'pdf_url' => 'about:blank',
            'is_locked' => false,
        ]);

        // ACTION
        app(AutoCreateCoaAfterValidation::class)
            ->handle($sampleId, $staffId);

        // ASSERT only one report
        $count = DB::table('reports')
            ->where('sample_id', $sampleId)
            ->count();

        $this->assertEquals(1, $count);
    }
}
