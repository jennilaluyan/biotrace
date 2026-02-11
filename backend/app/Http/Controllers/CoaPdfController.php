<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Report;
use App\Services\CoaFinalizeService;
use App\Services\CoaPdfService;
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
            if ($hint !== '' && str_contains($roleName, $hint)) {
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

        $disk = config('coa.storage_disk', 'local');

        if ($report->is_locked && $report->pdf_url) {
            if (Storage::disk($disk)->exists($report->pdf_url)) {
                $binary = Storage::disk($disk)->get($report->pdf_url);

                $hashOk = empty($report->document_hash) || hash('sha256', $binary) === $report->document_hash;

                if ($hashOk) {
                    AuditLog::create([
                        'staff_id' => $staff->staff_id,
                        'entity_name' => 'report',
                        'entity_id' => $report->report_id,
                        'action' => 'VIEW_COA',
                        'ip_address' => $request->ip(),
                        'new_values' => ['hash' => $report->document_hash],
                    ]);

                    return response($binary, 200, [
                        'Content-Type' => 'application/pdf',
                        'Content-Disposition' => 'inline; filename="coa.pdf"',
                    ]);
                }
            }

            $report->update([
                'document_hash' => null,
                'is_locked' => false,
            ]);
        }

        $templateCode = $request->query('template_code');
        $templateCode = is_string($templateCode) && trim($templateCode) !== '' ? $templateCode : null;

        $res = $this->finalizer->finalize(
            (int) $report->report_id,
            (int) $staff->staff_id,
            $templateCode
        );

        $path = (string) $res['pdf_url'];

        if (!Storage::disk($disk)->exists($path)) {
            return response()->json(['message' => 'COA generated but PDF file not found in storage.'], 500);
        }

        $binaryFinal = Storage::disk($disk)->get($path);

        $report->refresh();

        AuditLog::create([
            'staff_id' => $staff->staff_id,
            'entity_name' => 'report',
            'entity_id' => $report->report_id,
            'action' => 'GENERATE_COA',
            'ip_address' => $request->ip(),
            'new_values' => ['pdf_url' => $path],
        ]);

        return response($binaryFinal, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="coa.pdf"',
        ]);
    }

    public function downloadByReport(int $reportId, Request $request)
    {
        $this->assertCoaViewer($request);

        $report = Report::query()->where('report_id', $reportId)->firstOrFail();
        return $this->downloadBySample($request, (int) $report->sample_id);
    }
}