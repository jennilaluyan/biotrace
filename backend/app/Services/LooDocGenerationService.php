<?php

namespace App\Services;

use App\Models\FileBlob;
use App\Models\LetterOfOrder;
use App\Models\LetterOfOrderItem;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class LooDocGenerationService
{
    public const DOC_CODE = 'LOO_SURAT_PENGUJIAN';

    public function __construct(
        private readonly FileStoreService $files,
        private readonly DocxTemplateRenderService $docxRenderer,
        private readonly DocxToPdfConverter $docxToPdf,
    ) {}

    /**
     * Generate merged DOCX + PDF for a LOO using the current template in DB,
     * store them in DB (files), and return snapshot metadata for payload.
     */
    public function generateAndStore(LetterOfOrder $loo, int $actorId, ?Carbon $at = null): array
    {
        $at ??= Carbon::now();

        // 1) Load template registry row (documents) + current version (document_versions)
        $doc = DB::table('documents')
            ->where('doc_code', self::DOC_CODE)
            ->where('is_active', 1)
            ->first();

        if (!$doc) {
            throw new RuntimeException('LOO template registry not found (documents row missing).');
        }
        if (empty($doc->current_version_id)) {
            throw new RuntimeException('LOO template has no uploaded DOCX yet (current_version_id is null).');
        }

        $ver = DB::table('document_versions')
            ->where('doc_version_id', (int) $doc->current_version_id)
            ->first();

        if (!$ver || empty($ver->file_id)) {
            throw new RuntimeException('LOO template current version is invalid (missing file_id).');
        }

        /** @var FileBlob $tplFile */
        $tplFile = FileBlob::query()->findOrFail((int) $ver->file_id);
        $templateBytes = (string) $tplFile->bytes;

        // 2) Build numbering
        $recordNo = $this->buildRecordNo((string) $doc->record_no_prefix, $at);  // DDMMYY
        $formCode = $this->buildFormCode((string) $doc->form_code_prefix, $at);  // DD-MM-YY
        $revisionNo = (int) ($doc->revision_no ?? 0);
        $templateVersion = (int) ($ver->version ?? 1);

        // 3) Prepare placeholders
        $payload = (array) ($loo->payload ?? []);

        $vars = [
            // numbering
            'record_no' => $recordNo,
            'form_code' => $formCode,

            // identity
            'loo_number' => (string) ($loo->number ?? ''),
            'generated_date' => $at->format('d/m/Y'),

            // client (best-effort from payload)
            'client_name' => (string) data_get($payload, 'client.name', data_get($payload, 'client_name', '')),
            'client_address' => (string) data_get($payload, 'client.address', data_get($payload, 'client_address', '')),
            'client_phone' => (string) data_get($payload, 'client.phone', data_get($payload, 'client_phone', '')),
            'client_email' => (string) data_get($payload, 'client.email', data_get($payload, 'client_email', '')),

            // lab metadata (best-effort)
            'lab_name' => (string) data_get($payload, 'lab.name', data_get($payload, 'lab_name', '')),
        ];

        // 4) Prepare LOO items table (cloneRow-compatible)
        // Your LetterOfOrderItem has: lo_id, sample_id, lab_sample_code, parameters (array cast).:contentReference[oaicite:2]{index=2}
        $items = LetterOfOrderItem::query()
            ->where('lo_id', $loo->lo_id)
            ->orderBy('item_id')
            ->get();

        $rows = [];
        $i = 1;
        foreach ($items as $it) {
            $rows[] = [
                // Use a stable "row key" placeholder in your DOCX table row like ${item_no}
                'item_no' => (string) $i++,
                'lab_sample_code' => (string) ($it->lab_sample_code ?? ''),
                'sample_id' => (string) ($it->sample_id ?? ''),
                'parameters' => $this->formatParameters($it->parameters),
            ];
        }

        // DocxTemplateRenderService (from your Step 7) supports $tables + cloneRow.
        // Put ${item_no} in the row you want repeated; then columns use ${lab_sample_code}, ${parameters}, etc.
        $tables = [
            'items' => [
                'key' => 'item_no',
                'rows' => $rows,
            ],
        ];

        // 5) Render merged DOCX + convert to PDF
        $mergedDocxBytes = $this->docxRenderer->render($templateBytes, $vars, $tables);
        $pdfBytes = $this->docxToPdf->convert($mergedDocxBytes);

        // 6) Store to DB (files)
        $safeNo = Str::of((string) $loo->number)->replace(['/', '\\', ' '], '-')->toString();
        $docxName = "LOO-{$safeNo}-{$at->format('YmdHis')}.docx";
        $pdfName = "LOO-{$safeNo}-{$at->format('YmdHis')}.pdf";

        $docxFileId = $this->files->storeBytes(
            $mergedDocxBytes,
            $docxName,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'docx',
            $actorId
        );

        $pdfFileId = $this->files->storeBytes(
            $pdfBytes,
            $pdfName,
            'application/pdf',
            'pdf',
            $actorId
        );

        // 7) Best-effort: generated_documents snapshot (don’t brick generation if schema differs)
        $this->tryUpsertGeneratedDocuments(
            $loo->lo_id,
            $recordNo,
            $formCode,
            $revisionNo,
            $templateVersion,
            $pdfFileId,
            $docxFileId,
            $actorId,
            $at
        );

        return [
            'record_no' => $recordNo,
            'form_code' => $formCode,
            'revision_no' => $revisionNo,
            'template_version' => $templateVersion,
            'pdf_file_id' => (int) $pdfFileId,
            'docx_file_id' => (int) $docxFileId,
            'generated_at' => $at->toISOString(),
            'download_url' => url("/api/v1/files/{$pdfFileId}"),
        ];
    }

    private function buildRecordNo(string $prefix, Carbon $at): string
    {
        return $prefix . $at->format('dmy'); // DDMMYY
    }

    private function buildFormCode(string $prefix, Carbon $at): string
    {
        return $prefix . $at->format('d-m-y'); // DD-MM-YY
    }

    private function formatParameters($parameters): string
    {
        if (is_string($parameters)) return $parameters;
        if (!is_array($parameters)) return '';
        // Keep it human-readable in the DOCX; you can change delimiter as needed.
        return implode(', ', array_map('strval', $parameters));
    }

    private function tryUpsertGeneratedDocuments(
        int $looId,
        string $recordNo,
        string $formCode,
        int $revisionNo,
        int $templateVersion,
        int $pdfFileId,
        int $docxFileId,
        int $actorId,
        Carbon $at
    ): void {
        try {
            DB::table('generated_documents')
                ->where('entity_type', 'loo')
                ->where('entity_id', $looId)
                ->where('is_active', 1)
                ->update([
                    'is_active' => 0,
                    'updated_at' => now(),
                ]);

            // Column names follow your master plan; adjust if your migration uses different names.
            DB::table('generated_documents')->insert([
                'doc_code' => self::DOC_CODE,
                'entity_type' => 'loo',
                'entity_id' => $looId,
                'record_no' => $recordNo,
                'form_code' => $formCode,
                'revision_no' => $revisionNo,
                'template_version' => $templateVersion,
                'file_pdf_id' => $pdfFileId,
                'file_docx_id' => $docxFileId,
                'generated_by' => $actorId,
                'generated_at' => $at->toDateTimeString(),
                'is_active' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (Throwable $e) {
            // Don’t block generation if schema differs; payload will still be correct.
            // You can log $e->getMessage() if you have a logger/audit helper wired.
        }
    }
}
