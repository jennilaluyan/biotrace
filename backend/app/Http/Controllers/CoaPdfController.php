<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\AuditLog;
use App\Services\CoaPdfService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class CoaPdfController extends Controller
{
    public function __construct(
        private readonly CoaPdfService $coaPdf
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
        $disk   = $this->coaPdf->disk();

        /**
         * 🔒 IMMUTABLE MODE (SELF-HEALING)
         */
        if ($report->is_locked && $report->pdf_url) {

            if (Storage::disk($disk)->exists($report->pdf_url)) {
                $binary = Storage::disk($disk)->get($report->pdf_url);

                if (hash('sha256', $binary) === $report->document_hash) {

                    // ✅ STEP 7 — AUDIT LOG
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

            // ❌ FILE / HASH RUSAK → RESET STATE
            $report->update([
                'pdf_url'       => null,
                'document_hash' => null,
                'is_locked'     => false,
            ]);
        }

        /**
         * 🔓 GENERATE MODE (ONCE ONLY)
         */
        $report->loadMissing(['sample.client', 'items', 'signatures']);

        // 1️⃣ Placeholder URL
        $verificationUrl = '__HASH__';

        // 2️⃣ Payload awal (tanpa QR)
        $payload = [
            'report'          => $report,
            'sample'          => $report->sample,
            'client'          => $report->sample->client,
            'items'           => $report->items,
            'signatures'      => $report->signatures,
            'verificationUrl' => $verificationUrl,
            'qr_data_uri'     => null,
        ];

        // 3️⃣ Render TANPA QR
        $binary = $this->coaPdf->renderWithMetadata(
            'reports.coa.individual',
            $payload,
            [
                'title'   => 'COA ' . $report->report_no,
                'author'  => 'Laboratorium Biomolekuler UNSRAT',
                'subject' => 'Certificate of Analysis',
            ]
        );

        // 4️⃣ HASH FINAL
        $hash = hash('sha256', $binary);

        // 5️⃣ Verification URL FINAL
        $verificationUrl = url('/api/v1/verify/coa/' . $hash);

        // 6️⃣ Generate QR
        $qrPng = file_get_contents(
            'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' .
                urlencode($verificationUrl)
        );

        // 7️⃣ Render FINAL + QR
        $payload['verificationUrl'] = $verificationUrl;
        $payload['qr_data_uri']     = 'data:image/png;base64,' . base64_encode($qrPng);

        $binaryFinal = $this->coaPdf->renderWithMetadata(
            'reports.coa.individual',
            $payload,
            [
                'title'   => 'COA ' . $report->report_no,
                'author'  => 'Laboratorium Biomolekuler UNSRAT',
                'subject' => 'Certificate of Analysis',
                'legal_marker' => implode(' | ', [
                    'BioTrace COA',
                    'ReportNo=' . $report->report_no,
                    'Hash=' . $hash,
                    'Verify=' . $verificationUrl,
                ]),
            ]
        );

        // 8️⃣ SIMPAN & LOCK
        $path = $this->coaPdf->buildPath($report->report_no, 'individual');
        $this->coaPdf->store($path, $binaryFinal);

        $report->update([
            'pdf_url'       => $path,
            'document_hash' => hash('sha256', $binaryFinal),
            'is_locked'     => true,
        ]);

        // ✅ STEP 7 — AUDIT LOG (GENERATE)
        AuditLog::create([
            'staff_id'   => $staff->staff_id,
            'entity_name' => 'report',
            'entity_id'  => $report->report_id,
            'action'     => 'GENERATE_COA',
            'ip_address' => $request->ip(),
            'new_values' => [
                'hash' => hash('sha256', $binaryFinal),
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
