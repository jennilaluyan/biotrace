<?php

namespace App\Http\Controllers;

use App\Models\Report;
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
        if (!$staff || !$staff->staff_id) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $report = \App\Models\Report::where('sample_id', $sampleId)->firstOrFail();
        $disk = $this->coaPdf->disk();

        /**
         * 🔒 IMMUTABLE MODE
         */
        if ($report->is_locked && $report->pdf_url) {
            $binary = Storage::disk($disk)->get($report->pdf_url);

            if (hash('sha256', $binary) !== $report->document_hash) {
                abort(409, 'Document integrity check failed.');
            }

            return response($binary, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="coa.pdf"',
            ]);
        }

        /**
         * 🔓 GENERATE MODE (ONCE ONLY)
         */
        $report->loadMissing(['sample.client', 'items', 'signatures']);

        // 1️⃣ Verification URL placeholder
        $verificationUrl = '__HASH__';

        // 2️⃣ Payload FINAL (QR BELUM ADA)
        $payload = [
            'report'          => $report,
            'sample'          => $report->sample,
            'client'          => $report->sample->client,
            'items'           => $report->items,
            'signatures'      => $report->signatures,
            'verificationUrl' => $verificationUrl,
            'qr_data_uri'     => null,
        ];

        // 3️⃣ Render FINAL SEKALI SAJA
        $binary = $this->coaPdf->renderWithMetadata(
            'reports.coa.individual',
            $payload,
            [
                'title'   => 'COA ' . $report->report_no,
                'author'  => 'Laboratorium Biomolekuler UNSRAT',
                'subject' => 'Certificate of Analysis',
            ]
        );

        // 4️⃣ HASH DARI PDF FINAL
        $hash = hash('sha256', $binary);

        // 5️⃣ Verification URL FINAL
        $verificationUrl = url('/api/v1/verify/coa/' . $hash);

        // 6️⃣ QR CODE
        $qrPng = file_get_contents(
            'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' .
                urlencode($verificationUrl)
        );

        // 7️⃣ Render ULANG SEKALI (FINAL + QR)
        $payload['verificationUrl'] = $verificationUrl;
        $payload['qr_data_uri'] = 'data:image/png;base64,' . base64_encode($qrPng);

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

        // 8️⃣ SIMPAN PDF FINAL (INI YANG DIHASH)
        $path = $this->coaPdf->buildPath($report->report_no, 'individual');
        $this->coaPdf->store($path, $binaryFinal);

        $report->update([
            'pdf_url'       => $path,
            'document_hash' => hash('sha256', $binaryFinal),
            'is_locked'     => true,
        ]);

        return response($binaryFinal, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="coa.pdf"',
        ]);
    }

    public function downloadByReport(int $reportId, Request $request)
    {
        $report = DB::table('reports')->where('report_id', $reportId)->firstOrFail();
        return $this->downloadBySample($request, (int) $report->sample_id);
    }
}
