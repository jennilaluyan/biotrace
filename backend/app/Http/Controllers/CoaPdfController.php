<?php

namespace App\Http\Controllers;

use App\Services\CoaPdfService;
use App\Services\ReportGenerationService;
use Illuminate\Http\Request;

class CoaPdfController extends Controller
{
    public function __construct(
        private readonly ReportGenerationService $reportGeneration,
        private readonly CoaPdfService $coaPdf,
    ) {}

    /**
     * Download/preview CoA PDF by sample_id.
     *
     * Query param:
     * - template_key: institution_v1 | institution_v2 (only for institution client)
     *
     * NOTE: RBAC "LH only" kita kunci di step berikutnya (Step RBAC).
     */
    public function downloadBySample(Request $request, int $sampleId)
    {
        // Ensure report row + snapshot items exist (idempotent)
        $staff = $request->user();
        $actorStaffId = (int) ($staff->staff_id ?? 0);

        if ($actorStaffId <= 0) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $report = $this->reportGeneration->generateForSample($sampleId, $actorStaffId);

        // We need client type for template decision
        $report->loadMissing(['sample.client', 'items', 'signatures']);

        $client = $report->sample?->client;

        // fleksibel: kalau field kamu client_type atau type, dua-duanya dicoba
        $clientType = strtolower((string) (
            data_get($client, 'client_type')
            ?? data_get($client, 'type')
            ?? 'individual'
        ));

        $requestedTemplate = (string) $request->query('template_key', '');

        if ($clientType === 'institution') {
            $templateKey = $requestedTemplate !== '' ? $requestedTemplate : 'institution_v1';
            if (!in_array($templateKey, ['institution_v1', 'institution_v2'], true)) {
                return response()->json([
                    'message' => 'Invalid template_key. Allowed: institution_v1, institution_v2',
                ], 422);
            }
        } else {
            // individual: always use individual template (no selector)
            $templateKey = 'individual';
        }

        $view = $this->coaPdf->resolveView($templateKey);

        // Data yang nanti dipakai blade (kita rapihin mapping field di step template final)
        $payload = [
            'report' => $report,
            'sample' => $report->sample,
            'client' => $client,
            'items' => $report->items,
            'signatures' => $report->signatures,
            'templateKey' => $templateKey,
        ];

        $binary = $this->coaPdf->render($view, $payload);

        $reportNo = (string) ($report->report_no ?? $report->report_id ?? 'coa');
        $path = $this->coaPdf->buildPath($reportNo, $templateKey);

        $this->coaPdf->store($path, $binary);

        // Simpan path ke reports.pdf_url (sementara path internal storage)
        $report->pdf_url = $path;
        $report->save();

        $filename = ($report->report_no ?: 'coa') . '.pdf';

        return response($binary, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $filename . '"',
        ]);
    }
}
