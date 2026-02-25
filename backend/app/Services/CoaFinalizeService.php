<?php

namespace App\Services;

use App\Models\Report;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class CoaFinalizeService
{
    public function __construct(
        private readonly CoaXlsxDocumentService $xlsxDocs,
    ) {}

    /**
     * Finalize COA:
     * - generate PDF from XLSX template (LibreOffice)
     * - lock report + attach pdf_file_id
     * - upsert LH signature slot
     * - set sample status to "reported"
     */
    public function finalize(int $reportId, int $actorStaffId, ?string $templateCode = null): array
    {
        return DB::transaction(function () use ($reportId, $actorStaffId, $templateCode) {
            /** @var Report $report */
            $report = Report::query()
                ->where('report_id', $reportId)
                ->lockForUpdate()
                ->firstOrFail();

            if ((bool) ($report->is_locked ?? false) === true) {
                throw new ConflictHttpException('CoA sudah difinalisasi.');
            }

            if (Schema::hasColumn('reports', 'report_type') && (string) ($report->report_type ?? '') !== 'coa') {
                throw new ConflictHttpException('Report ini bukan CoA.');
            }

            $generatedAt = now();

            // Generate using XLSX template (stored in DB) -> PDF via LibreOffice
            $gen = $this->xlsxDocs->generateForReport(
                reportId: (int) $report->report_id,
                actorStaffId: (int) $actorStaffId,
                forceRegenerate: true,
                generatedAt: $generatedAt,
                overrideTemplateCode: $this->normalizeTemplateCode($templateCode),
            );

            $pdfFileId = (int) ($gen['pdf_file_id'] ?? 0);
            $docCode = (string) ($gen['doc_code'] ?? '');

            if ($pdfFileId <= 0 || $docCode === '') {
                throw new RuntimeException('CoA XLSX generation failed (missing pdf_file_id/doc_code).');
            }

            // Lock report + attach metadata
            $update = [
                'is_locked' => true,
                'updated_at' => now(),
            ];

            if (Schema::hasColumn('reports', 'pdf_file_id')) {
                $update['pdf_file_id'] = $pdfFileId;
            }

            // Store stable code (COA_PCR_MANDIRI / COA_PCR_KERJASAMA / COA_WGS)
            if (Schema::hasColumn('reports', 'template_code')) {
                $update['template_code'] = $docCode;
            }

            if (Schema::hasColumn('reports', 'finalized_at')) {
                $update['finalized_at'] = $generatedAt;
            }
            if (Schema::hasColumn('reports', 'finalized_by')) {
                $update['finalized_by'] = $actorStaffId;
            }

            DB::table('reports')->where('report_id', $reportId)->update($update);

            // Upsert LH signature (best-effort)
            if (Schema::hasTable('report_signatures')) {
                DB::table('report_signatures')->updateOrInsert(
                    ['report_id' => $reportId, 'role_code' => 'LH'],
                    [
                        'signed_by' => $actorStaffId,
                        'signed_at' => $generatedAt,
                        'updated_at' => now(),
                    ]
                );
            }

            // Set sample -> reported (best-effort)
            if (Schema::hasTable('samples')) {
                $statusCol = Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';

                DB::table('samples')
                    ->where('sample_id', (int) $report->sample_id)
                    ->update([$statusCol => 'reported']);
            }

            return [
                'report_id' => $reportId,
                'pdf_file_id' => $pdfFileId,
                'download_url' => "/api/v1/files/{$pdfFileId}",
                'template_code' => $docCode,
                'doc_code' => $docCode,

                // helpful metadata (also saved in generated_documents)
                'record_no' => (string) ($gen['record_no'] ?? ''),
                'form_code' => (string) ($gen['form_code'] ?? ''),
            ];
        });
    }

    private function normalizeTemplateCode(?string $templateCode): ?string
    {
        $t = is_string($templateCode) ? trim($templateCode) : '';
        return $t !== '' ? $t : null;
    }
}
