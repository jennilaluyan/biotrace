<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\Sample;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CoaDownloadController extends Controller
{
    private const ALLOWED_ROLE_IDS = [2, 5, 6];
    private const ALLOWED_ROLE_NAME_HINTS = ['Administrator', 'admin', 'administrator'];

    private function assertCoaViewer(Request $request): void
    {
        $user = $request->user();
        if (!$user) abort(401, 'Unauthenticated.');

        $roleId = (int) ($user->role_id ?? 0);
        if (in_array($roleId, self::ALLOWED_ROLE_IDS, true)) return;

        $roleName = strtolower(trim((string) (
            $user->role_name
            ?? $user->role_label
            ?? ($user->role->name ?? null)
            ?? ($user->role->label ?? null)
            ?? ''
        )));

        foreach (self::ALLOWED_ROLE_NAME_HINTS as $hint) {
            if ($hint !== '' && str_contains($roleName, strtolower($hint))) return;
        }

        if ((int) ($user->is_admin ?? 0) === 1) return;

        abort(403, 'Forbidden.');
    }

    public function bySample(Request $request, Sample $sample)
    {
        $this->assertCoaViewer($request);

        if (!Schema::hasTable('reports') || !Schema::hasColumn('reports', 'pdf_file_id')) {
            return response()->json([
                'message' => 'CoA DB-backed PDF is not available (missing reports.pdf_file_id column).',
                'code' => 'COA_SCHEMA_MISSING',
            ], 500);
        }

        $q = Report::query()->where('sample_id', (int) $sample->sample_id);

        if (Schema::hasColumn('reports', 'report_type')) $q->where('report_type', 'coa');
        if (Schema::hasColumn('reports', 'template_code')) $q->whereNotNull('template_code');
        if (Schema::hasColumn('reports', 'is_locked')) $q->where('is_locked', 1);

        $q->whereNotNull('pdf_file_id'); // ✅ Step 21

        $orderCol = Schema::hasColumn('reports', 'report_id') ? 'report_id' : 'id';
        $report = $q->orderByDesc($orderCol)->first();

        if (!$report) {
            return response()->json([
                'message' => 'CoA not found or not finalized yet.',
            ], 409);
        }

        $pdfFileId = (int) ($report->pdf_file_id ?? 0);
        if ($pdfFileId <= 0) {
            return response()->json([
                'message' => 'CoA exists but PDF is not available (missing pdf_file_id).',
                'report_id' => (int) ($report->report_id ?? 0),
                'code' => 'COA_PDF_NOT_AVAILABLE',
            ], 409);
        }

        return redirect()->to(url("/api/v1/files/{$pdfFileId}"));
    }

    public function byReport(Request $request, Report $report)
    {
        $this->assertCoaViewer($request);

        if (Schema::hasColumn('reports', 'report_type')) {
            if ((string) ($report->report_type ?? '') !== 'coa') {
                return response()->json(['message' => 'This report is not a CoA.'], 409);
            }
        }

        if (!Schema::hasColumn('reports', 'pdf_file_id')) {
            return response()->json([
                'message' => 'CoA DB-backed PDF is not available (missing reports.pdf_file_id column).',
                'code' => 'COA_SCHEMA_MISSING',
            ], 500);
        }

        if (Schema::hasColumn('reports', 'is_locked')) {
            if ((bool) ($report->is_locked ?? false) !== true) {
                return response()->json([
                    'message' => 'CoA exists but is not finalized yet.',
                    'report_id' => (int) ($report->report_id ?? 0),
                ], 409);
            }
        }

        $pdfFileId = (int) ($report->pdf_file_id ?? 0);
        if ($pdfFileId <= 0) {
            return response()->json([
                'message' => 'CoA PDF not available yet for this report (missing pdf_file_id).',
                'report_id' => (int) ($report->report_id ?? 0),
                'code' => 'COA_PDF_NOT_AVAILABLE',
            ], 409);
        }

        return redirect()->to(url("/api/v1/files/{$pdfFileId}"));
    }
}
