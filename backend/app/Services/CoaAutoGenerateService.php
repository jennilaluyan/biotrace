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

            // ✅ AUTO TEMPLATE SELECT (rule kamu)
            $group = strtolower(trim((string) ($sample->workflow_group ?? '')));

            if (!$templateCode) {
                // 1) WGS -> wgs.blade.php
                if ($group !== '' && str_contains($group, 'wgs')) {
                    $templateCode = 'wgs';
                }
                // 2) PCR SARS-CoV-2 -> institution OR individual (based on client.type)
                elseif (
                    $group !== '' &&
                    str_contains($group, 'pcr') &&
                    (str_contains($group, 'sars') || str_contains($group, 'cov'))
                ) {
                    $clientType = 'individual';

                    if (!empty($sample->client_id)) {
                        $client = DB::table('clients')->where('client_id', (int) $sample->client_id)->first();
                        if ($client) {
                            $field = (string) config('coa.client_type.field', 'type');
                            $raw = strtolower(trim((string) data_get($client, $field, '')));

                            $institutionValues = array_map('strtolower', (array) config('coa.client_type.institution_values', []));
                            $individualValues = array_map('strtolower', (array) config('coa.client_type.individual_values', []));

                            if ($raw !== '' && in_array($raw, $institutionValues, true)) {
                                $clientType = 'institution';
                            } elseif ($raw !== '' && in_array($raw, $individualValues, true)) {
                                $clientType = 'individual';
                            }
                        }
                    }

                    $templateCode = $clientType === 'institution' ? 'institution' : 'individual';
                }
                // 3) selain itu -> other (notes textbox)
                else {
                    $templateCode = 'other';
                }
            }

            // safety: kalau key gak ada di config, fallback
            if (!\App\Support\CoaTemplate::exists((string) $templateCode)) {
                $templateCode = 'individual';
            }

            // 1) Hard gate: Quality Cover must be validated (latest QC only)
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

            $hasIsLockedCol = Schema::hasColumn('reports', 'is_locked');

            // 3a) Idempotent: already locked => return
            if ($report && $hasIsLockedCol && (bool) $report->is_locked === true) {
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

                $report = Report::query()->where('report_id', (int) $rid)->lockForUpdate()->first();
                if (!$report) {
                    throw new ConflictHttpException('Generated report not found.');
                }
            }

            // 5) Finalize (render PDF + lock report). CoaFinalizeService handles view selection.
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

    /**
     * DOMPDF-safe QR data uri (PNG->SVG->Bacon SVG).
     */
    private function makeQrDataUri(?string $payload): ?string
    {
        $payload = $payload ? trim($payload) : '';
        if ($payload === '') return null;

        // 1) Try PNG (SimpleSoftwareIO)
        try {
            if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                $png = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
                    ->size(110)->margin(1)->generate($payload);

                if (is_string($png) && $png !== '') {
                    return 'data:image/png;base64,' . base64_encode($png);
                }
            }
        } catch (\Throwable $e) {
            // ignore -> fallback SVG
        }

        // 2) SVG (SimpleSoftwareIO)
        try {
            if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                $svg = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')
                    ->size(110)->margin(0)->generate($payload);

                if (is_string($svg) && trim($svg) !== '') {
                    $svg2 = $svg;
                    if (stripos($svg2, 'width=') === false) {
                        $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                    }
                    return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                }
            }
        } catch (\Throwable $e) {
            // ignore -> fallback bacon
        }

        // 3) BaconQrCode SVG fallback
        try {
            if (
                class_exists(\BaconQrCode\Writer::class) &&
                class_exists(\BaconQrCode\Renderer\ImageRenderer::class) &&
                class_exists(\BaconQrCode\Renderer\RendererStyle\RendererStyle::class) &&
                class_exists(\BaconQrCode\Renderer\Image\SvgImageBackEnd::class)
            ) {
                $style = new \BaconQrCode\Renderer\RendererStyle\RendererStyle(110);
                $backend = new \BaconQrCode\Renderer\Image\SvgImageBackEnd();
                $renderer = new \BaconQrCode\Renderer\ImageRenderer($style, $backend);
                $writer = new \BaconQrCode\Writer($renderer);

                $svg = $writer->writeString($payload);
                if (is_string($svg) && trim($svg) !== '') {
                    $svg2 = $svg;
                    if (stripos($svg2, 'width=') === false) {
                        $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                    }
                    return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                }
            }
        } catch (\Throwable $e) {
            // ignore
        }

        return null;
    }
}
