<?php

namespace App\Services;

use App\Models\Report;
use App\Support\CoaSignatureResolver;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class CoaFinalizeService
{
    public function finalize(int $reportId, int $actorStaffId, ?string $templateCode = null): array
    {
        return DB::transaction(function () use ($reportId, $actorStaffId, $templateCode) {

            /** @var Report $report */
            $report = Report::where('report_id', $reportId)->firstOrFail();

            // 1️⃣ pastikan belum finalized
            if ((bool) $report->is_locked === true) {
                throw new ConflictHttpException('CoA sudah difinalisasi.');
            }

            // 2️⃣ pastikan ini CoA (kalau kolom ada)
            if (Schema::hasColumn('reports', 'report_type')) {
                if ((string) $report->report_type !== 'coa') {
                    throw new ConflictHttpException('Report ini bukan CoA.');
                }
            }

            // 3️⃣ resolve signature LH
            $sig = CoaSignatureResolver::resolveLabHeadSignature($actorStaffId);

            // 4️⃣ determine client type (individual / institution)
            $clientType = DB::table('clients')
                ->join('samples', 'samples.client_id', '=', 'clients.client_id')
                ->where('samples.sample_id', $report->sample_id)
                ->value('clients.type') ?: 'individual';

            // 4b️⃣ determine workflow group (wgs / pcr / others)
            $workflowGroup = DB::table('samples')
                ->where('sample_id', $report->sample_id)
                ->value('workflow_group');

            $group = strtolower(trim((string) $workflowGroup));
            $isWgs = $group !== '' && str_contains($group, 'wgs');

            // 4c️⃣ normalize allowed template codes (supports legacy too)
            $allowed = [
                'INDIVIDUAL',
                'INSTITUTION',
                'WGS',
                // legacy codes (in case older data / manual override)
                'INST_V1',
                'INST_V2',
                'INSTITUTION_V1',
                'INSTITUTION_V2',
            ];

            $normalized = null;
            if ($templateCode && in_array($templateCode, $allowed, true)) {
                $normalized = $templateCode;
            }

            // 4d️⃣ choose final template + blade view (must match your blade filenames)
            // - WGS always uses reports.coa.wgs
            // - Institution uses reports.coa.institution
            // - Individual uses reports.coa.individual
            $finalTemplate = 'INDIVIDUAL';
            $view = 'reports.coa.individual';

            if ($isWgs) {
                $finalTemplate = 'WGS';
                $view = 'reports.coa.wgs';
            } elseif ($clientType === 'institution') {
                $finalTemplate = 'INSTITUTION';
                $view = 'reports.coa.institution';
            } else {
                $finalTemplate = 'INDIVIDUAL';
                $view = 'reports.coa.individual';
            }

            // allow explicit override ONLY if it doesn't break the blade mapping you asked for
            if ($normalized) {
                // map legacy overrides into current stable codes
                if (in_array($normalized, ['INST_V1', 'INSTITUTION_V1'], true)) {
                    $finalTemplate = 'INSTITUTION';
                    $view = 'reports.coa.institution';
                } elseif (in_array($normalized, ['INST_V2', 'INSTITUTION_V2'], true)) {
                    // your project uses wgs.blade.php for WGS
                    // institution v2 doesn't exist in your blade list, so we map to institution
                    $finalTemplate = $isWgs ? 'WGS' : 'INSTITUTION';
                    $view = $isWgs ? 'reports.coa.wgs' : 'reports.coa.institution';
                } elseif ($normalized === 'WGS') {
                    $finalTemplate = 'WGS';
                    $view = 'reports.coa.wgs';
                } elseif ($normalized === 'INSTITUTION') {
                    $finalTemplate = 'INSTITUTION';
                    $view = 'reports.coa.institution';
                } elseif ($normalized === 'INDIVIDUAL') {
                    $finalTemplate = 'INDIVIDUAL';
                    $view = 'reports.coa.individual';
                }
            }

            // 5️⃣ build view data (builder already prepares: $client, $sample, $items, qr_data_uri, lh_signature_data_uri, etc)
            $viewData = app(CoaViewDataBuilder::class)
                ->build($report->report_id, $sig['data_uri'], $actorStaffId);

            // 6️⃣ render FINAL PDF
            $pdf = Pdf::loadView($view, $viewData)->setPaper('a4');
            $bytes = $pdf->output();

            $disk = config('coa.storage_disk', 'local');
            $year = now()->format('Y');

            $reportNo = (string) ($report->report_no ?: "REPORT-{$report->report_id}");
            $safeNo = str_replace('/', '-', $reportNo);

            $path = "reports/coa/{$year}/{$safeNo}_{$finalTemplate}_FINAL.pdf";
            Storage::disk($disk)->put($path, $bytes);

            // 7️⃣ update report
            $update = [
                'pdf_url'   => $path,
                'is_locked' => true,
            ];

            if (Schema::hasColumn('reports', 'template_code')) {
                $update['template_code'] = $finalTemplate;
            }
            if (Schema::hasColumn('reports', 'finalized_at')) {
                $update['finalized_at'] = now();
            }
            if (Schema::hasColumn('reports', 'finalized_by')) {
                $update['finalized_by'] = $actorStaffId;
            }

            DB::table('reports')->where('report_id', $reportId)->update($update);

            // 8️⃣ upsert signature
            DB::table('report_signatures')->updateOrInsert(
                ['report_id' => $reportId, 'role_code' => 'LH'],
                [
                    'signed_by' => $actorStaffId,
                    'signed_at' => now(),
                ]
            );

            // 9️⃣ set sample → reported
            $statusCol = Schema::hasColumn('samples', 'current_status')
                ? 'current_status'
                : 'status';

            DB::table('samples')
                ->where('sample_id', $report->sample_id)
                ->update([$statusCol => 'reported']);

            return [
                'report_id'     => $reportId,
                'pdf_url'       => $path,
                'template_code' => $finalTemplate,
            ];
        });
    }
}
