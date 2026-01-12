<?php

namespace App\Actions;

use App\Services\ReportGenerationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class AutoCreateCoaAfterValidation
{
    public function handle(int $sampleId, int $actorStaffId): void
    {
        try {
            // sample harus validated
            $statusCol = Schema::hasColumn('samples', 'current_status')
                ? 'current_status'
                : 'status';

            $isValidated = DB::table('samples')
                ->where('sample_id', $sampleId)
                ->where($statusCol, 'validated')
                ->exists();

            if (!$isValidated) {
                return;
            }

            // semua sample_tests harus validated
            $hasUnvalidatedTest = DB::table('sample_tests')
                ->where('sample_id', $sampleId)
                ->where('status', '!=', 'validated')
                ->exists();

            if ($hasUnvalidatedTest) {
                return;
            }

            // QC PASS semua
            if (Schema::hasColumn('sample_tests', 'qc_done')) {
                $qcFail = DB::table('sample_tests')
                    ->where('sample_id', $sampleId)
                    ->where('qc_done', false)
                    ->exists();

                if ($qcFail) {
                    return;
                }
            }

            // CEGAH DUPLIKASI CoA
            $coaExists = DB::table('reports')
                ->where('sample_id', $sampleId)
                ->when(
                    Schema::hasColumn('reports', 'report_type'),
                    fn($q) => $q->where('report_type', 'coa')
                )
                ->exists();

            if ($coaExists) {
                return;
            }

            // CREATE DRAFT CoA
            app(ReportGenerationService::class)
                ->generateForSample($sampleId, $actorStaffId);
        } catch (Throwable $e) {
            // SAFETY: jangan ganggu alur validasi LH
            report($e);
        }
    }
}
