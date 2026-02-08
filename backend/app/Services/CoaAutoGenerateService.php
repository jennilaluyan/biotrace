<?php

namespace App\Services;

use App\Models\Report;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

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
            $sample = DB::table('samples')
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->first();

            if (!$sample) {
                throw new ConflictHttpException('Sample not found.');
            }

            // 1) Hard gate: latest Quality Cover must be validated
            $qc = DB::table('quality_covers')
                ->where('sample_id', $sampleId)
                ->orderByDesc('quality_cover_id')
                ->lockForUpdate()
                ->first();

            if (!$qc || (string) ($qc->status ?? '') !== 'validated') {
                throw new ConflictHttpException('Quality cover belum validated oleh LH.');
            }

            // 2) Hard gate: sample status should be validated/reported
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
                try {
                    $generated = $this->reportGeneration->generateForSample($sampleId, $lhStaffId);
                } catch (\RuntimeException $e) {
                    $msg = (string) $e->getMessage();

                    // map common business-gate errors -> 409
                    if ($msg !== '' && stripos($msg, 'no tests') !== false) {
                        throw new ConflictHttpException('Cannot generate COA: no tests for this sample.');
                    }

                    // fallback: still a conflict (better than 500 for gate-like runtime exceptions)
                    throw new ConflictHttpException($msg !== '' ? $msg : 'Cannot generate COA report.');
                } catch (\Throwable $e) {
                    // unknown error => keep it 500 (controller will handle)
                    throw $e;
                }

                $rid = null;
                if (is_array($generated)) {
                    $rid = $generated['report_id'] ?? null;
                } else {
                    $rid = $generated->report_id ?? null;
                }

                if (!$rid) {
                    throw new ConflictHttpException('Failed to generate report record.');
                }

                $report = Report::query()
                    ->where('report_id', (int) $rid)
                    ->lockForUpdate()
                    ->first();

                if (!$report) {
                    throw new ConflictHttpException('Generated report not found.');
                }
            }

            // 5) Finalize (render PDF + lock report)
            $final = $this->coaFinalize->finalize((int) $report->report_id, $lhStaffId, $templateCode);

            $report->refresh();

            return [
                'report_id' => (int) $report->report_id,
                'pdf_url' => (string) ($report->pdf_url ?? ($final['pdf_url'] ?? '')),
                'template_code' => (string) ($final['template_code'] ?? ($report->template_code ?? '')),
                'is_locked' => (bool) $report->is_locked,
            ];
        };

        // Reuse outer transaction if already running
        if (method_exists(DB::class, 'transactionLevel') && DB::transactionLevel() > 0) {
            return $runner();
        }

        return DB::transaction($runner);
    }
}
