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

            // 4️⃣ tentukan template
            $clientType = DB::table('clients')
                ->join('samples', 'samples.client_id', '=', 'clients.client_id')
                ->where('samples.sample_id', $report->sample_id)
                ->value('clients.type') ?: 'individual';

            if ($clientType === 'institution') {
                $finalTemplate = $templateCode ?: 'INST_V1';
            } else {
                $finalTemplate = 'INDIVIDUAL';
            }

            // 5️⃣ build view
            $view = $clientType === 'institution'
                ? ($finalTemplate === 'INST_V2'
                    ? 'reports.coa.institution_v2'
                    : 'reports.coa.institution_v1')
                : 'reports.coa.individual';

            $viewData = app(CoaViewDataBuilder::class)
                ->build($report->report_id, $sig['data_uri'], $actorStaffId);

            // 6️⃣ render FINAL PDF
            $pdf = Pdf::loadView($view, $viewData)->setPaper('a4');
            $bytes = $pdf->output();

            $disk = config('coa.storage_disk', 'local');
            $year = now()->format('Y');
            $safeNo = str_replace('/', '-', $report->report_no);
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
                'report_id'    => $reportId,
                'pdf_url'      => $path,
                'template_code' => $finalTemplate,
            ];
        });
    }
}
