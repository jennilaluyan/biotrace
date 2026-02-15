<?php

namespace App\Services;

use App\Models\Report;
use App\Support\CoaSignatureResolver;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

            // 7️⃣ render FINAL PDF (DomPDF for now)
            $pdf = Pdf::loadView($view, $viewData)->setPaper('a4');
            $bytes = $pdf->output();

            // ===============================
            // ✅ STEP 11: STORE PDF TO DB (files) instead of Storage
            // ===============================

            // Map legacy template codes -> new doc_code (stable naming)
            $docCode = $this->resolveCoaDocCodeFromTemplate($finalTemplate);

            $generatedAt = now();

            // Try fetch template meta to build record_no + form_code
            $tpl = DB::table('documents')
                ->where('doc_code', $docCode)
                ->where('kind', 'template')
                ->first();

            $recordNo = null;
            $formCode = null;
            $revisionNo = 0;
            $templateVersion = null;

            if ($tpl) {
                $revisionNo = (int) ($tpl->revision_no ?? 0);

                $recPrefix = trim((string) ($tpl->record_no_prefix ?? ''));
                if ($recPrefix !== '') {
                    // DDMMYY
                    $recordNo = $recPrefix . $generatedAt->format('dmy');
                }

                $formPrefix = trim((string) ($tpl->form_code_prefix ?? ''));
                if ($formPrefix !== '') {
                    // DD-MM-YY
                    $formCode = $formPrefix . $generatedAt->format('d-m-y');
                }

                // template version snapshot (optional)
                $currentVerId = (int) ($tpl->version_current_id ?? 0);
                if ($currentVerId > 0) {
                    $templateVersion = DB::table('document_versions')
                        ->where('doc_ver_id', $currentVerId)
                        ->value('version_no');
                    $templateVersion = $templateVersion !== null ? (int) $templateVersion : null;
                }
            }

            // filename for metadata
            $reportNo = (string) ($report->report_no ?: "REPORT-{$report->report_id}");
            $safeNo = preg_replace('/[^A-Za-z0-9._-]+/', '-', str_replace('/', '-', $reportNo));
            $pdfName = "{$safeNo}_{$docCode}_FINAL.pdf";

            // store to files table
            $fileId = app(FileStoreService::class)->storeBytes(
                $bytes,
                $pdfName,
                'application/pdf',
                'pdf',
                $actorStaffId,
                true
            );

            // 8️⃣ update report (set pdf_file_id + lock)
            $update = [
                'is_locked' => true,
            ];

            if (Schema::hasColumn('reports', 'pdf_file_id')) {
                $update['pdf_file_id'] = $fileId;
            }

            // keep legacy fields if present (do NOT write Storage anymore)
            if (Schema::hasColumn('reports', 'pdf_url')) {
                // keep existing pdf_url as-is for backward compatibility
                // (do not overwrite; step 11 no longer creates storage file)
            }

            if (Schema::hasColumn('reports', 'template_code')) {
                $update['template_code'] = $finalTemplate;
            }
            if (Schema::hasColumn('reports', 'finalized_at')) {
                $update['finalized_at'] = $generatedAt;
            }
            if (Schema::hasColumn('reports', 'finalized_by')) {
                $update['finalized_by'] = $actorStaffId;
            }

            DB::table('reports')->where('report_id', $reportId)->update(array_merge($update, [
                'updated_at' => now(),
            ]));

            // 8.5️⃣ generated_documents snapshot (if table exists)
            if (Schema::hasTable('generated_documents')) {
                // archive previous active
                DB::table('generated_documents')
                    ->where('entity_type', 'report')
                    ->where('entity_id', $reportId)
                    ->where('is_active', true)
                    ->update([
                        'is_active' => false,
                        'updated_at' => now(),
                    ]);

                DB::table('generated_documents')->insert([
                    'doc_code' => $docCode,
                    'entity_type' => 'report',
                    'entity_id' => $reportId,
                    'record_no' => $recordNo,
                    'form_code' => $formCode,
                    'revision_no' => $revisionNo,
                    'template_version' => $templateVersion,
                    'file_pdf_id' => $fileId,
                    'file_docx_id' => null,
                    'generated_by' => $actorStaffId,
                    'generated_at' => $generatedAt,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

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
                'pdf_file_id'   => $fileId,
                'download_url'  => "/api/v1/files/{$fileId}",
                'template_code' => $finalTemplate,
                'doc_code'      => $docCode,
                'record_no'     => $recordNo,
                'form_code'     => $formCode,
            ];
        });
    }

    /**
     * Map legacy template_code -> new doc_code.
     * Keep it strict and predictable (step 19 will polish aliasing further).
     */
    private function resolveCoaDocCodeFromTemplate(?string $templateCode): string
    {
        $t = strtolower(trim((string) $templateCode));

        if ($t === '') {
            return 'COA_PCR_MANDIRI';
        }

        // legacy aliases
        if (in_array($t, ['individual', 'coa_individual', 'coa_mandiri', 'mandiri', 'pcr_mandiri'], true)) {
            return 'COA_PCR_MANDIRI';
        }

        if (in_array($t, ['institution', 'coa_institution', 'kerjasama', 'kerja_sama', 'pcr_kerjasama'], true)) {
            return 'COA_PCR_KERJASAMA';
        }

        if (str_contains($t, 'wgs')) {
            return 'COA_WGS';
        }

        // fallback: keep default
        return 'COA_PCR_MANDIRI';
    }
}
