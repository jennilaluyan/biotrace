<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Report;
use App\Services\CoaFinalizeService;
use App\Services\CoaPdfService;
use App\Services\FileStoreService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class CoaPdfController extends Controller
{
    private const ALLOWED_ROLE_IDS = [2, 5, 6];
    private const ALLOWED_ROLE_NAME_HINTS = ['Administrator', 'admin', 'administrator'];

    public function __construct(
        private readonly CoaPdfService $coaPdf,
        private readonly CoaFinalizeService $finalizer,
        private readonly FileStoreService $files,
    ) {}

    private function assertCoaViewer(Request $request): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        $roleId = (int) ($user->role_id ?? 0);
        if (in_array($roleId, self::ALLOWED_ROLE_IDS, true)) {
            return;
        }

        $roleName = strtolower(trim((string) (
            $user->role_name
            ?? $user->role_label
            ?? ($user->role->name ?? null)
            ?? ($user->role->label ?? null)
            ?? ''
        )));

        foreach (self::ALLOWED_ROLE_NAME_HINTS as $hint) {
            if ($hint !== '' && str_contains($roleName, strtolower($hint))) {
                return;
            }
        }

        if ((int) ($user->is_admin ?? 0) === 1) {
            return;
        }

        abort(403, 'Forbidden.');
    }

    private function latestCoaReportForSample(int $sampleId): Report
    {
        $q = Report::query()->where('sample_id', $sampleId);

        if (Schema::hasColumn('reports', 'report_type')) {
            $q->where('report_type', 'coa');
        }

        return $q->orderByDesc('report_id')->firstOrFail();
    }

    public function downloadBySample(Request $request, int $sampleId)
    {
        $this->assertCoaViewer($request);

        $staff = $request->user();
        $report = $this->latestCoaReportForSample($sampleId);

        // ===============================
        // ✅ STEP 11: Prefer DB file if available
        // ===============================
        if ($report->is_locked) {
            // 1) New path: pdf_file_id
            if (Schema::hasColumn('reports', 'pdf_file_id') && (int) ($report->pdf_file_id ?? 0) > 0) {
                AuditLog::create([
                    'staff_id' => $staff->staff_id,
                    'entity_name' => 'report',
                    'entity_id' => $report->report_id,
                    'action' => 'VIEW_COA',
                    'ip_address' => $request->ip(),
                    'new_values' => ['pdf_file_id' => (int) $report->pdf_file_id],
                ]);

                return $this->files->streamResponse((int) $report->pdf_file_id);
            }

            // 2) Legacy fallback: pdf_url in storage (transitional)
            $disk = config('coa.storage_disk', 'local');
            if ($report->pdf_url && Storage::disk($disk)->exists($report->pdf_url)) {
                $binary = Storage::disk($disk)->get($report->pdf_url);

                $hashOk = empty($report->document_hash) || hash('sha256', $binary) === $report->document_hash;

                if ($hashOk) {
                    AuditLog::create([
                        'staff_id' => $staff->staff_id,
                        'entity_name' => 'report',
                        'entity_id' => $report->report_id,
                        'action' => 'VIEW_COA',
                        'ip_address' => $request->ip(),
                        'new_values' => ['hash' => $report->document_hash, 'pdf_url' => $report->pdf_url],
                    ]);

                    return response($binary, 200, [
                        'Content-Type' => 'application/pdf',
                        'Content-Disposition' => 'inline; filename="coa.pdf"',
                    ]);
                }

                // hash mismatch -> unlock to regenerate
                $report->update([
                    'document_hash' => null,
                    'is_locked' => false,
                ]);
            } else {
                // locked but missing both db file + legacy file: unlock to regenerate
                $report->update([
                    'is_locked' => false,
                ]);
            }
        }

        // If not locked (or was unlocked), finalize on demand
        $templateCode = $request->query('template_code');
        $templateCode = is_string($templateCode) && trim($templateCode) !== '' ? $templateCode : null;

        $res = $this->finalizer->finalize(
            (int) $report->report_id,
            (int) $staff->staff_id,
            $templateCode
        );

        $report->refresh();

        // Must have pdf_file_id now
        $pdfFileId = (int) ($res['pdf_file_id'] ?? ($report->pdf_file_id ?? 0));
        if ($pdfFileId <= 0) {
            return response()->json(['message' => 'COA generated but pdf_file_id is missing.'], 500);
        }

        AuditLog::create([
            'staff_id' => $staff->staff_id,
            'entity_name' => 'report',
            'entity_id' => $report->report_id,
            'action' => 'GENERATE_COA',
            'ip_address' => $request->ip(),
            'new_values' => [
                'pdf_file_id' => $pdfFileId,
                'download_url' => "/api/v1/files/{$pdfFileId}",
                'template_code' => $res['template_code'] ?? null,
                'doc_code' => $res['doc_code'] ?? null,
            ],
        ]);

        return $this->files->streamResponse($pdfFileId);
    }

    public function downloadByReport(int $reportId, Request $request)
    {
        $this->assertCoaViewer($request);

        $report = Report::query()->where('report_id', $reportId)->firstOrFail();
        return $this->downloadBySample($request, (int) $report->sample_id);
    }
}
