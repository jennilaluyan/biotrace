<?php

namespace App\Services;

use App\Models\Report;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CoaAutoGenerateService
{
    public function __construct(
        private readonly ReportGenerationService $reportGeneration,
        private readonly CoaFinalizeService $coaFinalize,
    ) {}

    /**
     * Idempotent runner:
     * - If report exists & locked => return existing pdf
     * - Else ensure report exists (generate if missing)
     * - Finalize => generate PDF, lock report, mark sample reported
     *
     * IMPORTANT:
     * - Runs inside a DB transaction (or reuses existing one).
     */
    public function run(int $sampleId, int $lhStaffId, ?string $templateCode = null): array
    {
        $runner = function () use ($sampleId, $lhStaffId, $templateCode) {

            // 0) Ensure sample exists + lock it to prevent race
            $sampleQ = DB::table('samples')->where('sample_id', $sampleId)->lockForUpdate();
            $sample = $sampleQ->first();

            if (!$sample) {
                throw new ConflictHttpException('Sample not found.');
            }

            // 1) Hard gate: Quality Cover must be validated
            // (latest QC only)
            $qc = DB::table('quality_covers')
                ->where('sample_id', $sampleId)
                ->orderByDesc('quality_cover_id')
                ->lockForUpdate()
                ->first();

            if (!$qc || (string) ($qc->status ?? '') !== 'validated') {
                throw new ConflictHttpException('Quality cover belum validated oleh LH.');
            }

            // 2) Hard gate: sample status should be validated (ReportGenerationService biasanya butuh ini)
            $statusCol = Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';
            $currentStatus = (string) ($sample->{$statusCol} ?? '');

            if ($currentStatus !== '' && $currentStatus !== 'validated' && $currentStatus !== 'reported') {
                throw new ConflictHttpException("Sample status belum validated (status={$currentStatus}).");
            }

            // 3) Find existing report for this sample (lock to avoid double create)
            $rq = Report::query()->where('sample_id', $sampleId);
            if (Schema::hasColumn('reports', 'report_type')) {
                $rq->where('report_type', 'coa');
            }

            /** @var Report|null $report */
            $report = $rq->orderByDesc('report_id')->lockForUpdate()->first();

            // 3a) Idempotent: already locked => return
            if ($report && (bool) $report->is_locked === true) {
                return [
                    'report_id' => (int) $report->report_id,
                    'pdf_url' => (string) ($report->pdf_url ?? ''),
                    'template_code' => (string) ($report->template_code ?? ''),
                    'is_locked' => true,
                ];
            }

            // 4) Ensure report exists (generate if missing)
            if (!$report) {
                $generated = $this->reportGeneration->generateForSample($sampleId, $lhStaffId);

                $rid = null;
                if (is_array($generated)) {
                    $rid = $generated['report_id'] ?? null;
                } else {
                    $rid = $generated->report_id ?? null;
                }

                if (!$rid) {
                    throw new ConflictHttpException('Failed to generate report record.');
                }

                $report = Report::query()->where('report_id', (int) $rid)->lockForUpdate()->first();
                if (!$report) {
                    throw new ConflictHttpException('Generated report not found.');
                }
            }

            // 5) Finalize (render PDF + lock report). CoaFinalizeService already handles view selection.
            $final = $this->coaFinalize->finalize((int) $report->report_id, $lhStaffId, $templateCode);

            // Re-fetch for latest values
            $report->refresh();

            return [
                'report_id' => (int) $report->report_id,
                'pdf_url' => (string) ($report->pdf_url ?? ($final['pdf_url'] ?? '')),
                'template_code' => (string) ($final['template_code'] ?? ($report->template_code ?? '')),
                'is_locked' => (bool) $report->is_locked,
            ];
        };

        // Reuse outer transaction if already running (so controller can be fully atomic)
        if (method_exists(DB::class, 'transactionLevel') && DB::transactionLevel() > 0) {
            return $runner();
        }

        return DB::transaction($runner);
    }
}
