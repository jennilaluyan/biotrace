<?php

namespace App\Http\Controllers;

use App\Services\CoaPdfService;
use App\Services\ReportGenerationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage; // ✅ FIX INTELEPHENSE

class CoaPdfController extends Controller
{
    public function __construct(
        private readonly ReportGenerationService $reportGeneration,
        private readonly CoaPdfService $coaPdf,
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
            if (!Storage::disk($disk)->exists($report->pdf_url)) {
                abort(500, 'Locked PDF missing.');
            }

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
         * 🔓 GENERATE MODE (ONCE)
         */
        $report->loadMissing(['sample.client', 'items', 'signatures']);

        /**
         * 1️⃣ Render FINAL TANPA QR → dapatkan HASH
         */
        $payload = [
            'report'          => $report,
            'sample'          => $report->sample,
            'client'          => $report->sample->client,
            'items'           => $report->items,
            'signatures'      => $report->signatures,
            'qr_data_uri'     => null,
            'verificationUrl' => null,
        ];

        $binaryDraft = $this->coaPdf->render(
            'reports.coa.individual',
            $payload
        );

        $hash = hash('sha256', $binaryDraft);

        /**
         * 2️⃣ Verification URL BERDASARKAN HASH FINAL
         */
        $verificationUrl = url('/api/v1/verify/coa/' . $hash);

        /**
         * 3️⃣ Generate QR (BASE64)
         */
        $qrPng = file_get_contents(
            'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data='
                . urlencode($verificationUrl)
        );

        $payload['qr_data_uri'] = 'data:image/png;base64,' . base64_encode($qrPng);
        $payload['verificationUrl'] = $verificationUrl;

        /**
         * 4️⃣ Metadata (STEP 6.4)
         */
        $meta = [
            'title'   => 'COA ' . $report->report_no,
            'author'  => 'Laboratorium Biomolekuler UNSRAT',
            'subject' => 'Certificate of Analysis',
            'keywords' => implode(', ', [
                'COA',
                $report->report_no,
                'BioTrace',
                'UNSRAT',
            ]),
            'legal_marker' => implode(' | ', [
                'BioTrace COA',
                'ReportNo=' . $report->report_no,
                'Hash=' . $hash,
                'Verify=' . $verificationUrl,
            ]),
        ];

        /**
         * 5️⃣ FINAL RENDER (QR + METADATA)
         */
        $binaryFinal = $this->coaPdf->renderWithMetadata(
            'reports.coa.individual',
            $payload,
            $meta
        );

        /**
         * 6️⃣ SIMPAN & LOCK
         */
        $path = $this->coaPdf->buildPath($report->report_no, 'individual');
        $this->coaPdf->store($path, $binaryFinal);

        $report->update([
            'pdf_url'       => $path,
            'document_hash' => $hash,
            'is_locked'     => true,
        ]);

        return response($binaryFinal, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="coa.pdf"',
        ]);
    }
}
