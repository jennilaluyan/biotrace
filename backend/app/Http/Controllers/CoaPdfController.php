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

        $report = $this->reportGeneration->generateForSample($sampleId, $actorStaffId);

        // 🔒 NO RE-GENERATE IF LOCKED
        if ($report->is_locked && $report->pdf_url) {
            $disk = $this->coaPdf->disk();

            if (Storage::disk($disk)->exists($report->pdf_url)) {
                $binary = Storage::disk($disk)->get($report->pdf_url);

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

        $payload = [
            'report' => $report,
            'sample' => $report->sample,
            'client' => $client,
            'items' => $report->items,
            'signatures' => $report->signatures,
            'templateKey' => $templateKey,
        ];

        $binary = $this->coaPdf->render($view, $payload);

        $path = $this->coaPdf->buildPath($report->report_no, $templateKey);
        $this->coaPdf->store($path, $binary);

        $report->pdf_url = $path;
        $report->save();

        return response($binary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' =>
            'inline; filename="' . ($report->report_no ?: 'coa') . '.pdf"',
        ]);
    }
}
