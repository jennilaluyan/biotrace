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

    public function run(int $sampleId, int $lhStaffId, ?string $templateCode = null): array
    {
        $runner = function () use ($sampleId, $lhStaffId, $templateCode) {
            $sample = DB::table('samples')
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->first();

            if (!$sample) {
                throw new ConflictHttpException('Sample not found.');
            }

            $sampleIds = $this->resolveCoaSampleIds($sampleId, $sample);

            $group = strtolower(trim((string) ($sample->workflow_group ?? '')));

            if (!$templateCode) {
                if ($group !== '' && str_contains($group, 'wgs')) {
                    $templateCode = 'wgs';
                } elseif (
                    $group !== '' &&
                    str_contains($group, 'pcr') &&
                    (str_contains($group, 'sars') || str_contains($group, 'cov'))
                ) {
                    $clientType = 'individual';

                    if (!empty($sample->client_id)) {
                        $client = DB::table('clients')
                            ->where('client_id', (int) $sample->client_id)
                            ->first();

                        if ($client) {
                            $field = (string) config('coa.client_type.field', 'type');
                            $raw = strtolower(trim((string) data_get($client, $field, '')));

                            $institutionValues = array_map(
                                'strtolower',
                                (array) config('coa.client_type.institution_values', [])
                            );
                            $individualValues = array_map(
                                'strtolower',
                                (array) config('coa.client_type.individual_values', [])
                            );

                            if ($raw !== '' && in_array($raw, $institutionValues, true)) {
                                $clientType = 'institution';
                            } elseif ($raw !== '' && in_array($raw, $individualValues, true)) {
                                $clientType = 'individual';
                            }
                        }
                    }

                    $templateCode = $clientType === 'institution' ? 'institution' : 'individual';
                } else {
                    $templateCode = 'other';
                }
            }

            if (!\App\Support\CoaTemplate::exists((string) $templateCode)) {
                $templateCode = 'individual';
            }

            $statusCol = Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';

            $lockedSamples = DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('sample_id');

            foreach ($sampleIds as $sid) {
                $batchSample = $lockedSamples->get($sid);

                if (!$batchSample) {
                    throw new ConflictHttpException("Cannot generate COA: sample {$sid} not found.");
                }

                $currentStatus = (string) ($batchSample->{$statusCol} ?? '');
                if ($currentStatus !== '' && !in_array($currentStatus, ['validated', 'reported'], true)) {
                    throw new ConflictHttpException(
                        "Cannot generate COA: sample {$sid} status is not validated (status={$currentStatus})."
                    );
                }

                $qc = DB::table('quality_covers')
                    ->where('sample_id', $sid)
                    ->orderByDesc('quality_cover_id')
                    ->lockForUpdate()
                    ->first();

                if (!$qc || (string) ($qc->status ?? '') !== 'validated') {
                    throw new ConflictHttpException(
                        "Cannot generate COA: sample {$sid} quality cover is not validated."
                    );
                }
            }

            $rq = Report::query()->where('sample_id', $sampleId);
            if (Schema::hasColumn('reports', 'report_type')) {
                $rq->where('report_type', 'coa');
            }

            /** @var Report|null $report */
            $report = $rq->orderByDesc('report_id')->lockForUpdate()->first();

            $hasIsLockedCol = Schema::hasColumn('reports', 'is_locked');

            if ($report && $hasIsLockedCol && (bool) $report->is_locked === true) {
                return [
                    'report_id' => (int) $report->report_id,
                    'pdf_url' => (string) ($report->pdf_url ?? ''),
                    'template_code' => (string) ($report->template_code ?? ''),
                    'is_locked' => true,
                ];
            }

            if (!$report) {
                try {
                    $generated = $this->reportGeneration->generateForSample($sampleId, $lhStaffId);
                } catch (\Throwable $e) {
                    $msg = strtolower((string) $e->getMessage());
                    if (str_contains($msg, 'no tests')) {
                        throw new ConflictHttpException('Cannot generate COA: no tests for this sample.');
                    }
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

            try {
                $final = $this->coaFinalize->finalize((int) $report->report_id, $lhStaffId, $templateCode);
            } catch (\Throwable $e) {
                $msg = strtolower((string) $e->getMessage());
                if (str_contains($msg, 'no tests')) {
                    throw new ConflictHttpException('Cannot generate COA: no tests for this sample.');
                }
                throw $e;
            }

            $report->refresh();

            return [
                'report_id' => (int) $report->report_id,
                'pdf_url' => (string) ($report->pdf_url ?? ($final['pdf_url'] ?? '')),
                'template_code' => (string) ($final['template_code'] ?? ($report->template_code ?? '')),
                'is_locked' => $hasIsLockedCol ? (bool) $report->is_locked : false,
            ];
        };

        if (method_exists(DB::class, 'transactionLevel') && DB::transactionLevel() > 0) {
            return $runner();
        }

        return DB::transaction($runner);
    }

    private function resolveCoaSampleIds(int $sampleId, ?object $lockedSample = null): array
    {
        $sample = $lockedSample ?: DB::table('samples')
            ->where('sample_id', $sampleId)
            ->lockForUpdate()
            ->first();

        if (!$sample) {
            throw new ConflictHttpException('Sample not found.');
        }

        $hasRequestBatchId = Schema::hasColumn('samples', 'request_batch_id');
        $hasBatchExcludedAt = Schema::hasColumn('samples', 'batch_excluded_at');
        $hasBatchItemNo = Schema::hasColumn('samples', 'request_batch_item_no');

        $requestBatchId = $hasRequestBatchId
            ? trim((string) ($sample->request_batch_id ?? ''))
            : '';

        $isExcluded = $hasBatchExcludedAt && !empty($sample->batch_excluded_at);

        if ($requestBatchId === '' || $isExcluded) {
            return [$sampleId];
        }

        $query = DB::table('samples')
            ->where('request_batch_id', $requestBatchId);

        if ($hasBatchExcludedAt) {
            $query->whereNull('batch_excluded_at');
        }

        if ($hasBatchItemNo) {
            $query->orderBy('request_batch_item_no');
        }

        $rows = $query
            ->orderBy('sample_id')
            ->lockForUpdate()
            ->get(['sample_id']);

        $ids = $rows
            ->pluck('sample_id')
            ->map(fn($id) => (int) $id)
            ->filter(fn(int $id) => $id > 0)
            ->values()
            ->all();

        if ($ids === []) {
            return [$sampleId];
        }

        return array_values(array_unique($ids));
    }
}
