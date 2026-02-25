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
     * Generate COA from uploaded XLSX template:
     * - Load active template bytes from DB (documents -> document_versions -> files)
     * - Replace ${vars}
     * - Convert XLSX -> PDF via LibreOffice
     * - Store XLSX & PDF in files table
     * - Attach reports.pdf_file_id
     * - Snapshot generated_documents (if table exists)
     */
    public function generateForReport(
        int $reportId,
        int $actorStaffId,
        bool $forceRegenerate = true,
        ?Carbon $generatedAt = null,
        ?string $overrideTemplateCode = null
    ): array {
        $this->assertPositive($reportId, 'report_id');
        $this->assertPositive($actorStaffId, 'actor_staff_id');

        $generatedAt = $generatedAt ?: now();
        $overrideTemplateCode = $this->normalizeTemplateCode($overrideTemplateCode);

        // Decide which doc_code to use (WGS vs PCR Kerjasama vs PCR Mandiri)
        $tpl = $this->coaPdf->resolveTemplate($reportId, $overrideTemplateCode);
        $docCode = (string) ($tpl['doc_code'] ?? 'COA_PCR_MANDIRI');

        // Reuse existing PDF if requested
        if (!$forceRegenerate && Schema::hasColumn('reports', 'pdf_file_id')) {
            $existing = (int) (DB::table('reports')->where('report_id', $reportId)->value('pdf_file_id') ?? 0);
            if ($existing > 0) {
                return [
                    'doc_code' => $docCode,
                    'pdf_file_id' => $existing,
                    'reused' => true,
                ];
            }
        }

        $report = $this->fetchReportOrFail($reportId);
        $sample = $this->fetchSampleOrFail((int) $report->sample_id, $reportId);
        $client = $this->fetchClientOrFallback($sample);

        $items = $this->fetchReportItems($reportId);

        // Numbering (consistent with other documents)
        $nums = $this->numbers->generate($docCode, $generatedAt);
        $recordNo = (string) ($nums['record_no'] ?? '');
        $formCodeFull = (string) ($nums['form_code'] ?? '');
        $revisionNo = (int) ($nums['revision_no'] ?? 0);

        // Some templates want only trailing date segment of form_code
        $formCodeDate = $this->extractTrailingDateCode($formCodeFull) ?: $generatedAt->format('d-m-y');

        // Dates
        $receivedAt = $this->fmtDate($sample->received_at ?? null);
        $testDate = $this->fmtDate($report->test_date ?? $this->pickFirstTestedAt($items));
        $validationDate = $this->fmtDate($this->pickLhSignedAt($reportId) ?? $report->updated_at ?? null);
        $printedAt = $this->fmtDate($generatedAt);
        $resultDate = $printedAt;

        // Results
        $orf1b = $this->pickFirstValueByNeedles($items, ['orf1b', 'orf1ab']);
        $rdrp = $this->pickFirstValueByNeedles($items, ['rdrp', 'rd-rp', 'rd rp']);
        $rpp30 = $this->pickFirstValueByNeedles($items, ['rpp30', 'rppp30']);
        $result = $this->inferResult($report, $items);

        $lineage = $this->pickFirstValueByNeedles($items, ['lineage']);
        $variant = $this->pickFirstValueByNeedles($items, ['variant', 'clade', 'mutasi']);

        // QC vars (from latest QC cover payload if available)
        $qcVars = $this->buildQcVars((int) ($sample->sample_id ?? 0));

        $vars = [
            // identifiers
            'doc_code' => $docCode,
            'report_id' => (string) $reportId,
            'report_no' => (string) ($report->report_no ?? ''),
            'sample_id' => (string) ($sample->sample_id ?? ''),
            'lab_sample_code' => (string) (($sample->lab_sample_code ?? $sample->sample_code ?? $sample->code ?? '') ?: ''),

            // numbering
            'record_no' => $recordNo,
            'form_code_full' => $formCodeFull,
            'form_code' => $formCodeDate,
            'revision_no' => (string) $revisionNo,

            // client
            'client_name' => (string) ($client->name ?? ''),
            'client_phone' => (string) ($client->phone ?? ''),
            'client_organization' => (string) ($client->organization ?? ''),
            'client_type' => (string) ($client->type ?? ''),
            'examination_purpose' => (string) ($sample->examination_purpose ?? ''),

            // dates
            'received_at' => $receivedAt,
            'test_date' => $testDate,
            'validation_date' => $validationDate,
            'printed_at' => $printedAt,
            'result_date' => $resultDate,

            // PCR
            'orf1b' => $orf1b ?? '',
            'rdrp' => $rdrp ?? '',
            'rpp30' => $rpp30 ?? '',
            'result' => $result ?? '',

            // WGS
            'lineage' => $lineage ?? '',
            'variant' => $variant ?? '',

            // misc
            'sample_type' => (string) ($sample->sample_type ?? ''),
            'workflow_group' => (string) ($sample->workflow_group ?? ''),
        ];

        // ✅ QC placeholders must be available BEFORE render
        $vars = array_merge($vars, $qcVars);

        // Load XLSX template from DB
        $tplRow = $this->loadActiveTemplateOrFail($docCode);
        $templateBytes = $tplRow['bytes'];
        $templateVersionNo = (int) $tplRow['template_version'];

        // Prevent multi-sheet export chaos
        $preferredSheet = $this->preferredSheetNameForDocCode($docCode);

        // Render & convert
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

        // Attach to report
        if (Schema::hasColumn('reports', 'pdf_file_id')) {
            DB::table('reports')->where('report_id', $reportId)->update([
                'pdf_file_id' => $pdfFileId,
                'updated_at' => now(),
            ]);
        }

        // Snapshot generated_documents (best-effort)
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
                // column name is file_docx_id, used as generic "source file" slot
                'file_docx_id' => $xlsxFileId,
                'generated_by' => $actorStaffId,
                'generated_at' => $generatedAt,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $wf = strtolower(trim((string) ($sample->workflow_group ?? '')));
        $isWgs = $wf !== '' && str_contains($wf, 'wgs');

        return [
            'doc_code' => $docCode,
            'pdf_file_id' => (int) $pdfFileId,
            'xlsx_file_id' => (int) $xlsxFileId,
            'template_version' => $templateVersionNo,
            'record_no' => $recordNo,
            'form_code' => $formCodeFull,
            'is_wgs' => $isWgs,
        ];
    }

    private function preferredSheetNameForDocCode(string $docCode): ?string
    {
        $dc = strtoupper(trim($docCode));

        // Per your rule:
        // - Sheet "1" for Kerjasama & Mandiri
        // - Sheet "LHU" for WGS
        return match ($dc) {
            'COA_PCR_MANDIRI' => '1',
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

        if (!$doc) {
            throw new RuntimeException("Template {$docCode} not found or inactive.");
        }

        $verId = (int) ($doc->version_current_id ?? 0);
        if ($verId <= 0) {
            throw new RuntimeException("Template {$docCode} has no uploaded version yet.");
        }

        $ver = DB::table('document_versions')
            ->where('doc_ver_id', $verId)
            ->first(['doc_ver_id', 'file_id', 'version_no']);

        if (!$ver) {
            throw new RuntimeException("Template {$docCode} version not found.");
        }

        $fileId = (int) ($ver->file_id ?? 0);
        if ($fileId <= 0) {
            throw new RuntimeException("Template {$docCode} version missing file_id.");
        }

        $file = $this->files->getFile($fileId);
        $bytes = $this->normalizeDbBytes($file->bytes ?? null);

        if ($bytes === '') {
            throw new RuntimeException("Template {$docCode} file bytes not found.");
        }

        return [
            'bytes' => $bytes,
            'template_version' => (int) ($ver->version_no ?? 0),
        ];
    }

    private function fetchReportOrFail(int $reportId): object
    {
        $report = DB::table('reports')->where('report_id', $reportId)->first();
        if (!$report) {
            throw new RuntimeException("Report {$reportId} not found.");
        }
        return $report;
    }

    private function fetchSampleOrFail(int $sampleId, int $reportId): object
    {
        $sample = DB::table('samples')->where('sample_id', $sampleId)->first();
        if (!$sample) {
            throw new RuntimeException("Sample not found for report {$reportId}.");
        }
        return $sample;
    }

    private function fetchClientOrFallback(object $sample): object
    {
        $client = null;

        if (!empty($sample->client_id) && Schema::hasTable('clients')) {
            $client = DB::table('clients')->where('client_id', (int) $sample->client_id)->first();
        }

        if (!$client) {
            return (object) [
                'name' => '',
                'phone' => '',
                'organization' => '',
                'type' => 'individual',
            ];
        }

        return (object) [
            'name' => $this->pickObjField($client, ['name', 'client_name', 'full_name']) ?? '',
            'phone' => $this->pickObjField($client, ['phone', 'phone_number', 'mobile', 'no_hp']) ?? '',
            'organization' => $this->pickObjField($client, ['organization', 'institution', 'company', 'instansi']) ?? '',
            'type' => strtolower($this->pickObjField($client, ['type', 'client_type', 'kind', 'category']) ?? 'individual'),
        ];
    }

    private function pickObjField(object $obj, array $candidates): ?string
    {
        foreach ($candidates as $c) {
            if (isset($obj->{$c}) && trim((string) $obj->{$c}) !== '') {
                return (string) $obj->{$c};
            }
        }
        return null;
    }

    private function fetchReportItems(int $reportId): array
    {
        return DB::table('report_items')
            ->where('report_id', $reportId)
            ->orderBy('order_no')
            ->orderBy('report_item_id')
            ->get()
            ->map(fn($r) => (array) $r)
            ->all();
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

    private function normalizeTemplateCode(?string $templateCode): ?string
    {
        $t = is_string($templateCode) ? trim($templateCode) : '';
        return $t !== '' ? $t : null;
    }

    private function assertPositive(int $value, string $name): void
    {
        if ($value <= 0) {
            throw new RuntimeException("{$name} is required.");
        }
    }

    private function normalizeDbBytes($bytes): string
    {
        if (is_resource($bytes)) {
            $read = stream_get_contents($bytes);
            return is_string($read) ? $read : '';
        }
        return is_string($bytes) ? $bytes : '';
    }

    private function buildQcVars(int $sampleId): array
    {
        $out = [
            'qc_orf1b_pos' => '+',
            'qc_orf1b_neg' => '-',
            'qc_rdrp_pos' => '+',
            'qc_rdrp_neg' => '-',
            'qc_rpp30_pos' => '+',
            'qc_rpp30_neg' => '-',
        ];

        if ($sampleId <= 0) return $out;

        $payload = $this->fetchLatestQualityCoverPayload($sampleId);
        if (!$payload) return $out;

        $out['qc_orf1b_pos'] = $this->pickQc($payload, 'ORF1b', 'positive') ?? $out['qc_orf1b_pos'];
        $out['qc_orf1b_neg'] = $this->pickQc($payload, 'ORF1b', 'negative') ?? $out['qc_orf1b_neg'];

        $out['qc_rdrp_pos'] = $this->pickQc($payload, 'RdRp', 'positive') ?? $out['qc_rdrp_pos'];
        $out['qc_rdrp_neg'] = $this->pickQc($payload, 'RdRp', 'negative') ?? $out['qc_rdrp_neg'];

        $out['qc_rpp30_pos'] = $this->pickQc($payload, 'RPP30', 'positive') ?? $out['qc_rpp30_pos'];
        $out['qc_rpp30_neg'] = $this->pickQc($payload, 'RPP30', 'negative') ?? $out['qc_rpp30_neg'];

        return $out;
    }

    private function fetchLatestQualityCoverPayload(int $sampleId): ?array
    {
        if (!Schema::hasTable('quality_covers')) return null;

        $row = DB::table('quality_covers')
            ->where('sample_id', $sampleId)
            ->orderByRaw("CASE WHEN status = 'validated' THEN 0 ELSE 1 END")
            ->orderByDesc('quality_cover_id')
            ->first(['qc_payload']);

        if (!$row) return null;

        $raw = $row->qc_payload ?? null;

        if (is_array($raw)) return $raw;
        if (is_object($raw)) return (array) $raw;

        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : null;
        }

        return null;
    }

    private function pickQc(array $payload, string $target, string $kind): ?string
    {
        $kind = strtolower($kind); // positive | negative

        $targets = [
            $target,
            strtoupper($target),
            strtolower($target),
        ];

        $kindKeys = $kind === 'positive'
            ? ['qc_positive', 'qcPositive', 'positive', 'pos', 'qc_pos']
            : ['qc_negative', 'qcNegative', 'negative', 'neg', 'qc_neg'];

        foreach (['qc_positive', 'qcPositive'] as $root) {
            if (isset($payload[$root]) && is_array($payload[$root])) {
                foreach ($targets as $tk) {
                    $v = $payload[$root][$tk] ?? null;
                    if ($v !== null && $v !== '') return (string) $v;
                }
            }
        }

        if (isset($payload['qc']) && is_array($payload['qc'])) {
            $qc = $payload['qc'];

            if ($kind === 'positive') {
                foreach (['positive', 'pos'] as $pKey) {
                    if (isset($qc[$pKey]) && is_array($qc[$pKey])) {
                        foreach ($targets as $tk) {
                            $v = $qc[$pKey][$tk] ?? null;
                            if ($v !== null && $v !== '') return (string) $v;
                        }
                    }
                }
            } else {
                foreach (['negative', 'neg'] as $nKey) {
                    if (isset($qc[$nKey]) && is_array($qc[$nKey])) {
                        foreach ($targets as $tk) {
                            $v = $qc[$nKey][$tk] ?? null;
                            if ($v !== null && $v !== '') return (string) $v;
                        }
                    }
                }
            }
        }

        foreach ($targets as $tk) {
            $node = $payload[$tk] ?? null;
            if (!is_array($node)) continue;

            foreach ($kindKeys as $k) {
                $v = $node[$k] ?? null;
                if ($v !== null && $v !== '') return (string) $v;
            }
        }

        return null;
    }
}
