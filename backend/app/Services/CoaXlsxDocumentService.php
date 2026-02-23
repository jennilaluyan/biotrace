<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

class CoaXlsxDocumentService
{
    private const ENTITY_TYPE = 'report';

    public function __construct(
        private readonly FileStoreService $files,
        private readonly DocNumberService $numbers,
        private readonly XlsxTemplateRenderService $xlsx,
        private readonly DocxToPdfConverter $converter,
        private readonly CoaPdfService $coaPdf,
    ) {}

    /**
     * Generate COA PDF from uploaded XLSX template for a report.
     * - Loads template from documents/document_versions/files (DB)
     * - Replaces ${vars}
     * - Converts XLSX -> PDF via LibreOffice
     * - Stores PDF in files and attaches reports.pdf_file_id
     * - Writes generated_documents snapshot (optional but recommended)
     */
    public function generateForReport(
        int $reportId,
        int $actorStaffId,
        bool $forceRegenerate = true,
        ?Carbon $generatedAt = null
    ): array {
        $this->assertPositive($reportId, 'report_id');
        $this->assertPositive($actorStaffId, 'actor_staff_id');

        $generatedAt = $generatedAt ?: now();

        // resolve which COA doc_code applies (WGS vs PCR Mandiri vs PCR Kerjasama)
        $tpl = $this->coaPdf->resolveTemplate($reportId, null);
        $docCode = (string) ($tpl['doc_code'] ?? 'COA_PCR_MANDIRI');

        // If already has PDF and not forced, reuse
        if (!$forceRegenerate && Schema::hasColumn('reports', 'pdf_file_id')) {
            $existing = (int) (DB::table('reports')->where('report_id', $reportId)->value('pdf_file_id') ?? 0);
            if ($existing > 0) {
                return ['doc_code' => $docCode, 'pdf_file_id' => $existing, 'reused' => true];
            }
        }

        // Load core data
        $report = DB::table('reports')->where('report_id', $reportId)->first();
        if (!$report) throw new RuntimeException("Report {$reportId} not found.");

        $sample = DB::table('samples')->where('sample_id', (int) $report->sample_id)->first();
        if (!$sample) throw new RuntimeException("Sample not found for report {$reportId}.");

        $client = null;
        if (!empty($sample->client_id) && Schema::hasTable('clients')) {
            $client = DB::table('clients')->where('client_id', (int) $sample->client_id)->first();
        }
        if (!$client) {
            $client = (object) ['name' => '', 'phone' => '', 'organization' => '', 'type' => 'individual'];
        }

        $items = DB::table('report_items')
            ->where('report_id', $reportId)
            ->orderBy('order_no')
            ->orderBy('report_item_id')
            ->get()
            ->map(fn($r) => (array) $r)
            ->all();

        $wf = strtolower(trim((string) ($sample->workflow_group ?? '')));
        $isWgs = $wf !== '' && str_contains($wf, 'wgs');

        // Numbering (consistent with LOO/RR)
        $nums = $this->numbers->generate($docCode, $generatedAt);
        $recordNo = (string) ($nums['record_no'] ?? '');
        $formCodeFull = (string) ($nums['form_code'] ?? '');
        $revisionNo = (int) ($nums['revision_no'] ?? 0);

        $formCodeDate = $this->extractTrailingDateCode($formCodeFull) ?: $generatedAt->format('d-m-y');

        // Dates
        $receivedAt = $this->fmtDate($sample->received_at ?? null);
        $testDate = $this->fmtDate($report->test_date ?? $this->pickFirstTestedAt($items));
        $validationDate = $this->fmtDate($this->pickLhSignedAt($reportId) ?? $report->updated_at ?? null);
        $printedAt = $this->fmtDate($generatedAt);
        $resultDate = $printedAt;

        // Extract results
        $orf1b = $this->pickFirstValueByNeedles($items, ['orf1b', 'orf1ab']);
        $rdrp  = $this->pickFirstValueByNeedles($items, ['rdrp', 'rd-rp', 'rd rp']);
        $rpp30 = $this->pickFirstValueByNeedles($items, ['rpp30', 'rppp30']);
        $result = $this->inferResult($report, $items);

        $lineage = $this->pickFirstValueByNeedles($items, ['lineage']);
        $variant = $this->pickFirstValueByNeedles($items, ['variant', 'clade', 'mutasi']);

        // Build vars for ${...}
        $vars = [
            // numbering
            'record_no' => $recordNo,
            'form_code_full' => $formCodeFull,
            'form_code' => $formCodeDate,
            'revision_no' => (string) $revisionNo,

            // identity
            'report_id' => (string) $reportId,
            'report_no' => (string) ($report->report_no ?? ''),
            'sample_id' => (string) ($sample->sample_id ?? ''),
            'lab_sample_code' => (string) ($sample->lab_sample_code ?? ''),

            // client
            'client_name' => (string) ($client->name ?? ''),
            'client_phone' => (string) ($client->phone ?? ''),
            'client_organization' => (string) ($client->organization ?? ''),
            'client_type' => (string) ($client->type ?? ''),

            // dates
            'received_at' => $receivedAt,
            'test_date' => $testDate,
            'validation_date' => $validationDate,
            'printed_at' => $printedAt,
            'result_date' => $resultDate,

            // PCR results
            'orf1b' => $orf1b ?? '',
            'rdrp' => $rdrp ?? '',
            'rpp30' => $rpp30 ?? '',
            'result' => $result ?? '',

            // WGS results
            'lineage' => $lineage ?? '',
            'variant' => $variant ?? '',

            // misc (optional)
            'sample_type' => (string) ($sample->sample_type ?? ''),
            'workflow_group' => (string) ($sample->workflow_group ?? ''),
        ];

        // Load XLSX template from DB
        $tplRow = $this->loadActiveTemplateOrFail($docCode);
        $templateBytes = $tplRow['bytes'];
        $templateVersionNo = (int) $tplRow['template_version'];

        // Prefer sheet per doc_code (prevents multi-sheet PDF explosions)
        $preferredSheet = $this->preferredSheetNameForDocCode($docCode);

        // Render + Convert
        $mergedXlsx = $this->xlsx->renderBytes($templateBytes, $vars, $preferredSheet);
        $pdfBytes = $this->converter->convertBytes($mergedXlsx, 'xlsx');

        // Store files
        $safeStem = $this->safeFileStem(($report->report_no ?? $docCode) . "_{$reportId}");
        $xlsxName = "{$safeStem}.xlsx";
        $pdfName = "{$safeStem}.pdf";

        $xlsxFileId = $this->files->storeBytes(
            $mergedXlsx,
            $xlsxName,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xlsx',
            $actorStaffId,
            true
        );

        $pdfFileId = $this->files->storeBytes(
            $pdfBytes,
            $pdfName,
            'application/pdf',
            'pdf',
            $actorStaffId,
            true
        );

        // Attach to reports
        if (Schema::hasColumn('reports', 'pdf_file_id')) {
            DB::table('reports')->where('report_id', $reportId)->update([
                'pdf_file_id' => $pdfFileId,
                'updated_at' => now(),
            ]);
        }

        // Snapshot generated_documents (best effort)
        if (Schema::hasTable('generated_documents')) {
            DB::table('generated_documents')
                ->where('doc_code', $docCode)
                ->where('entity_type', self::ENTITY_TYPE)
                ->where('entity_id', $reportId)
                ->where('is_active', true)
                ->update([
                    'is_active' => false,
                    'updated_at' => now(),
                ]);

            DB::table('generated_documents')->insert([
                'doc_code' => $docCode,
                'entity_type' => self::ENTITY_TYPE,
                'entity_id' => $reportId,
                'record_no' => $recordNo !== '' ? $recordNo : '—',
                'form_code' => $formCodeFull !== '' ? $formCodeFull : '—',
                'revision_no' => $revisionNo,
                'template_version' => $templateVersionNo,
                'file_pdf_id' => $pdfFileId,

                // NOTE: column name is file_docx_id, but we store XLSX source there (generic "source file").
                'file_docx_id' => $xlsxFileId,

                'generated_by' => $actorStaffId,
                'generated_at' => $generatedAt,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return [
            'doc_code' => $docCode,
            'pdf_file_id' => (int) $pdfFileId,
            'xlsx_file_id' => (int) $xlsxFileId,
            'template_version' => $templateVersionNo,
            'is_wgs' => $isWgs,
        ];
    }

    private function preferredSheetNameForDocCode(string $docCode): ?string
    {
        $dc = strtoupper(trim($docCode));
        return match ($dc) {
            'COA_PCR_MANDIRI' => 'master',
            'COA_PCR_KERJASAMA' => '1',
            'COA_WGS' => 'LHU',
            default => null,
        };
    }

    private function loadActiveTemplateOrFail(string $docCode): array
    {
        if (!Schema::hasTable('documents') || !Schema::hasTable('document_versions') || !Schema::hasTable('files')) {
            throw new RuntimeException('Document template tables are missing.');
        }

        $doc = DB::table('documents')
            ->where('doc_code', $docCode)
            ->where('kind', 'template')
            ->where('is_active', true)
            ->first(['doc_id', 'version_current_id']);

        if (!$doc) throw new RuntimeException("Template {$docCode} not found or inactive.");
        $verId = (int) ($doc->version_current_id ?? 0);
        if ($verId <= 0) throw new RuntimeException("Template {$docCode} has no uploaded version yet.");

        $ver = DB::table('document_versions')
            ->where('doc_ver_id', $verId)
            ->first(['doc_ver_id', 'file_id', 'version_no']);

        if (!$ver) throw new RuntimeException("Template {$docCode} version not found.");
        $fileId = (int) ($ver->file_id ?? 0);
        if ($fileId <= 0) throw new RuntimeException("Template {$docCode} version missing file_id.");

        $file = $this->files->getFile($fileId);
        $bytes = $this->normalizeDbBytes($file->bytes ?? null);

        if ($bytes === '') throw new RuntimeException("Template {$docCode} file bytes not found.");

        return [
            'bytes' => $bytes,
            'template_version' => (int) ($ver->version_no ?? 0),
        ];
    }

    private function normalizeDbBytes($bytes): string
    {
        if (is_resource($bytes)) {
            $read = stream_get_contents($bytes);
            return is_string($read) ? $read : '';
        }
        return is_string($bytes) ? $bytes : '';
    }

    private function pickLhSignedAt(int $reportId): ?string
    {
        if (!Schema::hasTable('report_signatures')) return null;

        $row = DB::table('report_signatures')
            ->where('report_id', $reportId)
            ->where('role_code', 'LH')
            ->orderByDesc('signature_id')
            ->first(['signed_at']);

        return $row?->signed_at ? (string) $row->signed_at : null;
    }

    private function pickFirstTestedAt(array $items): ?string
    {
        foreach ($items as $it) {
            $v = $it['tested_at'] ?? null;
            if ($v !== null && $v !== '') return (string) $v;
        }
        return null;
    }

    private function inferResult(object $report, array $items): ?string
    {
        if (property_exists($report, 'result') && $report->result !== null && trim((string) $report->result) !== '') {
            return (string) $report->result;
        }

        $x = $this->pickFirstValueByNeedles($items, ['hasil', 'result', 'kesimpulan', 'conclusion']);
        if ($x !== null) return $x;

        foreach ($items as $it) {
            $v = $it['interpretation'] ?? null;
            if ($v !== null && $v !== '') return (string) $v;
        }

        return null;
    }

    private function pickFirstValueByNeedles(array $items, array $needles): ?string
    {
        $needles = array_values(array_filter(array_map(fn($s) => strtolower(trim((string) $s)), $needles)));

        foreach ($items as $it) {
            $name = strtolower(trim((string) ($it['parameter_name'] ?? '')));
            if ($name === '') continue;

            foreach ($needles as $n) {
                if ($n !== '' && str_contains($name, $n)) {
                    $v = $it['result_value'] ?? null;
                    if ($v === null || $v === '') $v = $it['interpretation'] ?? null;
                    if ($v !== null && $v !== '') return (string) $v;
                }
            }
        }

        return null;
    }

    private function fmtDate($value): string
    {
        if (!$value) return '';
        try {
            return Carbon::parse($value)->format('d/m/Y');
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function extractTrailingDateCode(string $formCodeFull): ?string
    {
        $s = trim($formCodeFull);
        if ($s === '') return null;

        if (preg_match('/(\d{2}-\d{2}-\d{2})\s*$/', $s, $m)) return $m[1];
        if (preg_match('/(\d{2}-\d{2}-\d{4})\s*$/', $s, $m)) return $m[1];

        return null;
    }

    private function safeFileStem(string $s): string
    {
        $s = trim($s);
        if ($s === '') $s = 'COA';

        $s = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '_', $s);
        $s = preg_replace('/\s+/', '_', $s) ?: 'COA';
        $s = preg_replace('/[^A-Za-z0-9_\-\.]+/', '_', $s) ?: 'COA';

        if (strlen($s) > 120) $s = substr($s, 0, 120);

        return $s . '_' . substr(hash('sha256', Str::uuid()->toString()), 0, 8);
    }

    private function assertPositive(int $value, string $name): void
    {
        if ($value <= 0) throw new RuntimeException("{$name} is required.");
    }
}
