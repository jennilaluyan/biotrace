<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\AuditLog;
use App\Services\CoaPdfService;
use App\Services\CoaFinalizeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class CoaPdfController extends Controller
{
    public function __construct(
        private readonly CoaPdfService $coaPdf,
        private readonly CoaFinalizeService $finalizer,
    ) {}

    public function downloadBySample(Request $request, int $sampleId)
    {
        $staff = $request->user();

        /**
         * 🔐 STEP 8 — STRICT ROLE ACCESS
         * ALLOWED:
         * - Operational Manager (role_id = 5)
         * - Laboratory Head     (role_id = 6)
         */
        if (
            !$staff ||
            !in_array((int) $staff->role_id, [5, 6], true)
        ) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $report = Report::where('sample_id', $sampleId)->firstOrFail();
        $disk   = config('coa.storage_disk', 'local');

        /**
         * 🔒 IMMUTABLE MODE (SELF-HEALING)
         */
        if ($report->is_locked && $report->pdf_url) {

            if (Storage::disk($disk)->exists($report->pdf_url)) {
                $binary = Storage::disk($disk)->get($report->pdf_url);

                // ✅ kalau document_hash belum ada, tetap allow preview
                $hashOk = empty($report->document_hash) || hash('sha256', $binary) === $report->document_hash;

                if ($hashOk) {

                    AuditLog::create([
                        'staff_id'   => $staff->staff_id,
                        'entity_name' => 'report',
                        'entity_id'  => $report->report_id,
                        'action'     => 'VIEW_COA',
                        'ip_address' => $request->ip(),
                        'new_values' => [
                            'hash' => $report->document_hash,
                        ],
                    ]);

                    return response($binary, 200, [
                        'Content-Type'        => 'application/pdf',
                        'Content-Disposition' => 'inline; filename="coa.pdf"',
                    ]);
                }
            }

            // ✅ jangan sentuh pdf_url (kolom NOT NULL)
            $report->update([
                'document_hash' => null,
                'is_locked'     => false,
            ]);
        }

        /**
         * 🔓 GENERATE MODE (ONCE ONLY)
         */
        // optional template override dari query ?template_code=WGS/INSTITUTION/INDIVIDUAL
        $templateCode = $request->query('template_code');
        $templateCode = is_string($templateCode) && trim($templateCode) !== '' ? $templateCode : null;

        // ✅ finalize akan render PDF, simpan ke storage, set pdf_url + lock
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

        // refresh supaya document_hash/is_locked terbaru kalau dibutuhkan
        $report->refresh();

        AuditLog::create([
            'staff_id'   => $staff->staff_id,
            'entity_name' => 'report',
            'entity_id'  => $report->report_id,
            'action'     => 'GENERATE_COA',
            'ip_address' => $request->ip(),
            'new_values' => [
                'pdf_url' => $path,
            ],
        ]);

        return response($binaryFinal, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'inline; filename="coa.pdf"',
        ]);
    }

    public function downloadByReport(int $reportId, Request $request)
    {
        $report = DB::table('reports')
            ->where('report_id', $reportId)
            ->firstOrFail();

        return $this->downloadBySample($request, (int) $report->sample_id);
    }
}
