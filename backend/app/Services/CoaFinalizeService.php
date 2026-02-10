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

            // 4️⃣ resolve template + view (single source of truth)
            // - resolver already enforces: WGS wins, institution vs individual, legacy codes
            $resolved = app(CoaPdfService::class)->resolveView($reportId, $templateCode);

            // ✅ keep everything consistent downstream (filename, reports.template_code, etc.)
            $finalTemplate = $resolved['template_code'];
            $view = $resolved['view'];

            // 6️⃣ build view data (must support your templates: qr_data_uri, lh_signature_data_uri, items, etc)
            $viewData = app(CoaViewDataBuilder::class)
                ->build($report->report_id, $sig['data_uri'], $actorStaffId);

            // compat: your PCR templates use $qr_data_uri, WGS uses $lh_signature_data_uri (fallback to qr)
            if (!array_key_exists('lh_signature_data_uri', $viewData) || empty($viewData['lh_signature_data_uri'])) {
                $viewData['lh_signature_data_uri'] = $sig['data_uri'] ?? null;
            }
            if (!array_key_exists('qr_data_uri', $viewData) || empty($viewData['qr_data_uri'])) {
                $viewData['qr_data_uri'] = $viewData['lh_signature_data_uri'] ?? ($sig['data_uri'] ?? null);
            }

            // 7️⃣ render FINAL PDF
            $pdf = Pdf::loadView($view, $viewData)->setPaper('a4');
            $bytes = $pdf->output();

            $disk = config('coa.storage_disk', 'local');
            $year = now()->format('Y');

            $reportNo = (string) ($report->report_no ?: "REPORT-{$report->report_id}");
            $safeNo = str_replace('/', '-', $reportNo);

            $path = "reports/coa/{$year}/{$safeNo}_{$finalTemplate}_FINAL.pdf";
            Storage::disk($disk)->put($path, $bytes);

            // 8️⃣ update report
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

            // 9️⃣ upsert signature
            DB::table('report_signatures')->updateOrInsert(
                ['report_id' => $reportId, 'role_code' => 'LH'],
                [
                    'signed_by' => $actorStaffId,
                    'signed_at' => now(),
                ]
            );

            // 🔟 set sample → reported
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
