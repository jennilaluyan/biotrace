<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\Sample;
use App\Services\CoaDownloadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CoaDownloadController extends Controller
{
    public function bySample(Request $request, Sample $sample, CoaDownloadService $dl)
    {
        // Find latest COA report for this sample
        $q = Report::query()->where('sample_id', (int) $sample->sample_id);

        if (Schema::hasColumn('reports', 'report_type')) {
            $q->where('report_type', 'coa');
        }

        if (Schema::hasColumn('reports', 'template_code')) {
            $q->whereNotNull('template_code');
        }

        $report = $q->orderByDesc('report_id')->first();

        if (!$report) {
            return response()->json([
                'message' => 'CoA not found for this sample yet.',
                'hint' => 'Validate Quality Cover (LH) to auto-generate CoA.',
            ], 409);
        }

        // Must be finalized/locked + has pdf_url
        if ((bool) ($report->is_locked ?? false) !== true || empty($report->pdf_url)) {
            return response()->json([
                'message' => 'CoA exists but is not finalized yet.',
                'hint' => 'Try again after LH validate completes / generation finishes.',
                'report_id' => (int) $report->report_id,
            ], 409);
        }

        return $dl->streamReportPdf($report);
    }

    public function byReport(Request $request, Report $report, CoaDownloadService $dl)
    {
        if (Schema::hasColumn('reports', 'report_type')) {
            if ((string) ($report->report_type ?? '') !== 'coa') {
                return response()->json([
                    'message' => 'This report is not a CoA.',
                ], 409);
            }
        }

        if ((bool) ($report->is_locked ?? false) !== true || empty($report->pdf_url)) {
            return response()->json([
                'message' => 'CoA PDF not available yet for this report.',
                'hint' => 'Finalize/lock CoA first (auto happens after LH validate).',
                'report_id' => (int) $report->report_id,
            ], 409);
        }

        return $dl->streamReportPdf($report);
    }
}
