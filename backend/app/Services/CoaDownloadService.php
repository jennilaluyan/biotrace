<?php

namespace App\Services;

use App\Models\Report;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class CoaDownloadService
{
    /**
     * Stream COA PDF by sample_id (latest COA report for that sample).
     */
    public function streamBySampleId(int $sampleId): StreamedResponse
    {
        $q = Report::query()->where('sample_id', $sampleId);

        // If column exists, enforce COA-only
        if (Schema::hasColumn('reports', 'report_type')) {
            $q->where('report_type', 'coa');
        }

        /** @var Report|null $report */
        $report = $q->orderByDesc('report_id')->first();

        if (!$report) {
            throw new NotFoundHttpException('COA report not found for this sample.');
        }

        return $this->streamByReport($report);
    }

    /**
     * Stream COA PDF by report_id.
     */
    public function streamByReportId(int $reportId): StreamedResponse
    {
        /** @var Report $report */
        $report = Report::query()->where('report_id', $reportId)->firstOrFail();

        // If column exists, enforce COA-only
        if (Schema::hasColumn('reports', 'report_type')) {
            if ((string) $report->report_type !== 'coa') {
                throw new ConflictHttpException('This report is not a COA.');
            }
        }

        return $this->streamByReport($report);
    }

    private function streamByReport(Report $report): StreamedResponse
    {
        // Must be finalized/locked to be downloadable as "final COA"
        if ((bool) ($report->is_locked ?? false) !== true) {
            throw new ConflictHttpException('COA has not been finalized yet.');
        }

        $path = (string) ($report->pdf_url ?? '');
        if ($path === '') {
            throw new NotFoundHttpException('COA PDF path is missing on report.');
        }

        $disk = (string) config('coa.storage_disk', 'local');

        if (!Storage::disk($disk)->exists($path)) {
            throw new NotFoundHttpException('COA PDF file not found on storage.');
        }

        $filename = $this->buildFilename($report);

        $stream = Storage::disk($disk)->readStream($path);
        if ($stream === false) {
            throw new NotFoundHttpException('Unable to open COA PDF stream.');
        }

        // NOTE: return type is StreamedResponse (matches response()->stream()) -> fixes IDE/phpstan warnings
        return response()->stream(
            function () use ($stream) {
                fpassthru($stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
            },
            200,
            [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
                'Cache-Control' => 'private, max-age=0, no-cache, no-store, must-revalidate',
                'Pragma' => 'no-cache',
            ]
        );
    }

    private function buildFilename(Report $report): string
    {
        $no = (string) ($report->report_no ?? '');
        $no = $no !== '' ? $no : ('REPORT-' . (string) ($report->report_id ?? '0'));
        $safe = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], '-', $no);

        $tpl = (string) ($report->template_code ?? 'COA');
        $tplSafe = preg_replace('/[^A-Za-z0-9_-]+/', '-', $tpl) ?: 'COA';

        return $safe . '_' . $tplSafe . '.pdf';
    }
}
