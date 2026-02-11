<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\Sample;
use App\Services\CoaDownloadService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CoaDownloadController extends Controller
{
    private const ALLOWED_ROLE_IDS = [1, 5, 6];

    private function assertCoaViewer(Request $request): void
    {
        $user = $request->user();
        $roleId = (int) ($user->role_id ?? 0);

        if (!$user || !in_array($roleId, self::ALLOWED_ROLE_IDS, true)) {
            abort(403, 'Forbidden.');
        }
    }

    public function bySample(Request $request, Sample $sample, CoaDownloadService $dl)
    {
        $this->assertCoaViewer($request);

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
            ], 409);
        }

        if ((bool) ($report->is_locked ?? false) !== true || empty($report->pdf_url)) {
            return response()->json([
                'message' => 'CoA exists but is not finalized yet.',
                'report_id' => (int) $report->report_id,
            ], 409);
        }

        return $dl->streamReportPdf($report);
    }

    public function byReport(Request $request, Report $report, CoaDownloadService $dl)
    {
        $this->assertCoaViewer($request);

        if (Schema::hasColumn('reports', 'report_type')) {
            if ((string) ($report->report_type ?? '') !== 'coa') {
                return response()->json(['message' => 'This report is not a CoA.'], 409);
            }
        }

        if ((bool) ($report->is_locked ?? false) !== true || empty($report->pdf_url)) {
            return response()->json([
                'message' => 'CoA PDF not available yet for this report.',
                'report_id' => (int) $report->report_id,
            ], 409);
        }

        return $dl->streamReportPdf($report);
    }
}