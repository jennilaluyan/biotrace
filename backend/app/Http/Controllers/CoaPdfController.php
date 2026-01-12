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
        $actorStaffId = (int) ($staff->staff_id ?? 0);

        if ($actorStaffId <= 0) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $report = \App\Models\Report::where('sample_id', $sampleId)->first();

        // 🔒 NO RE-GENERATE IF LOCKED
        if ($report->is_locked && $report->pdf_url) {
            $disk = $this->coaPdf->disk();

            if (Storage::disk($disk)->exists($report->pdf_url)) {
                $binary = Storage::disk($disk)->get($report->pdf_url);

                // 🔎 VERIFIKASI HASH
                $currentHash = hash('sha256', $binary);

                if ($report->document_hash !== $currentHash) {
                    abort(409, 'Document integrity check failed.');
                }

                return response($binary, 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' =>
                    'inline; filename="' . ($report->report_no ?: 'coa') . '.pdf"',
                ]);
            }
        }

        // load data only if NOT locked
        $report->loadMissing(['sample.client', 'items', 'signatures']);

        $client = $report->sample?->client;
        $clientType = strtolower((string)(
            data_get($client, 'client_type')
            ?? data_get($client, 'type')
            ?? 'individual'
        ));

        $requestedTemplate = (string) $request->query('template_key', '');
        $templateKey = $clientType === 'institution'
            ? ($requestedTemplate ?: 'institution_v1')
            : 'individual';

        $view = $this->coaPdf->resolveView($templateKey);

        $hashForQr = $report->document_hash ?: 'pending';

        $qrBinary = $this->coaPdf->generateQrPng(
            url('/api/public/verify/coa/' . $hashForQr)
        );

        $payload = [
            'report' => $report,
            'sample' => $report->sample,
            'client' => $client,
            'items' => $report->items,
            'signatures' => $report->signatures,
            'templateKey' => $templateKey,

            'qr_data_uri' => 'data:image/png;base64,' . base64_encode($qrBinary),
        ];

        $binary = $this->coaPdf->render($view, $payload);

        // 🔐 HITUNG DOCUMENT HASH (SHA-256)
        $documentHash = hash('sha256', $binary);

        $path = $this->coaPdf->buildPath($report->report_no, $templateKey);
        $this->coaPdf->store($path, $binary);

        // 🔒 SIMPAN SEKALI SAJA (SOURCE OF TRUTH)
        $hash = hash('sha256', $binary);

        $report->pdf_url = $path;
        $report->document_hash = $hash;
        $report->is_locked = true;
        $report->save();

        return response($binary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' =>
            'inline; filename="' . ($report->report_no ?: 'coa') . '.pdf"',
        ]);
    }
}
