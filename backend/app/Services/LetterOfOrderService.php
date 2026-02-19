<?php

namespace App\Services;

use App\Models\FileBlob;
use App\Models\LetterOfOrder;
use App\Models\LetterOfOrderItem;
use App\Models\LooSignature;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

class LetterOfOrderService
{
    private const DOC_CODE_LOO = 'LOO_SURAT_PENGUJIAN';

    public function __construct(
        private readonly LooNumberGenerator $numberGen,
        private readonly LooPdfService $pdf, // legacy-only (path builder), keep for backward compat
        private readonly FileStoreService $files,
        private readonly DocNumberService $docNumber,
        private readonly DocxTemplateRenderService $docx,
        private readonly DocxToPdfConverter $docxToPdf,
    ) {}

    /**
     * letter_of_order_items table sometimes exists but is incomplete in your env.
     * Only use it if it has the required columns.
     */
    private function isItemsTableUsable(): bool
    {
        $table = 'letter_of_order_items';
        if (!Schema::hasTable($table)) return false;

        $required = ['lo_id', 'sample_id', 'lab_sample_code', 'parameters'];
        foreach ($required as $col) {
            if (!Schema::hasColumn($table, $col)) return false;
        }

        return true;
    }

    /**
     * Build in-memory items relation so we never query broken items table.
     */
    private function buildItemsModels(int $loId, array $itemsSnapshot): Collection
    {
        $rows = [];

        foreach ($itemsSnapshot as $it) {
            $rows[] = LetterOfOrderItem::make([
                'lo_id' => $loId,
                'sample_id' => (int) ($it['sample_id'] ?? 0),
                'lab_sample_code' => (string) ($it['lab_sample_code'] ?? ''),
                'parameters' => $it['parameters'] ?? [],
                'created_at' => now(),
                'updated_at' => null,
            ]);
        }

        return collect($rows);
    }

    /**
     * Find existing LoO by anchor sample_id (unique constraint uq_lo_sample).
     * If found, we must reuse it to avoid duplicate key error.
     */
    private function findExistingByAnchorSampleId(int $anchorSampleId): ?LetterOfOrder
    {
        if ($anchorSampleId <= 0) return null;

        return LetterOfOrder::query()
            ->where('sample_id', $anchorSampleId)
            ->orderByDesc('lo_id')
            ->first();
    }

    /**
     * Legacy helper: keep file_url under storage/app/private/reports/loo/...
     * We keep this only for backward compatibility with older disk-based flows.
     * New Step 12: actual PDF bytes are stored in DB (files) and referenced by payload.pdf_file_id.
     */
    private function forceReportsLooPath(string $pathOrAnything, string $looNumber): string
    {
        $p = str_replace('\\', '/', trim((string) $pathOrAnything));

        if (preg_match('/^https?:\/\//i', $p)) {
            $u = parse_url($p, PHP_URL_PATH);
            if (is_string($u) && $u !== '') $p = $u;
        }

        $p = ltrim($p, '/');

        if (str_starts_with($p, 'letters/loo/')) {
            $p = preg_replace('#^letters/loo/#', 'reports/loo/', $p);
        }

        if (str_starts_with($p, 'reports/loo/')) {
            return $p;
        }

        $year = now()->format('Y');
        $safe = str_replace(['/', '\\'], '_', trim($looNumber));
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $safe) ?: 'loo';
        return "reports/loo/{$year}/{$safe}.pdf";
    }

    /**
     * Step 12:
     * Ensure PDF exists in DB (files table) for a given LoO, using payload snapshot (safe).
     * Generates even for DRAFT so preview works right after generate.
     *
     * Writes:
     * - payload.pdf_file_id
     * - payload.docx_file_id (optional but we store it)
     * - payload.record_no
     * - payload.form_code
     * - payload.revision_no (from documents registry)
     * - payload.template_version (from document_versions.version)
     */
    private function ensurePdfInDb(
        LetterOfOrder $loa,
        array $payload,
        array $itemsSnapshot,
        int $actorStaffId,
        bool $forceRegenerate = false
    ): void {
        $number = (string) ($loa->number ?? data_get($payload, 'loo_number', data_get($payload, 'loa_number', '')));

        if ($number === '') {
            $number = $this->numberGen->nextNumber();
            $loa->number = $number;
        }

        // Load template registry + current version
        $docQ = DB::table('documents')
            ->where('doc_code', self::DOC_CODE_LOO)
            ->where('kind', 'template')
            ->where('is_active', true);

        $cols = ['doc_id', 'doc_code', 'version_current_id'];

        if (Schema::hasColumn('documents', 'current_version_id')) {
            $cols[] = 'current_version_id';
        }

        $doc = $docQ->first($cols);

        if (!$doc) {
            throw new RuntimeException('LOO template registry not found or inactive (documents row missing).');
        }

        $docVerId = (int) ($doc->version_current_id ?? 0);
        if ($docVerId <= 0 && isset($doc->current_version_id)) {
            $docVerId = (int) ($doc->current_version_id ?? 0);
        }

        if ($docVerId <= 0) {
            throw new RuntimeException('LOO template has no uploaded DOCX yet (version_current_id is null).');
        }

        $ver = DB::table('document_versions')
            ->where('doc_ver_id', $docVerId)
            ->first(['doc_ver_id', 'version_no', 'file_id']);

        if (!$ver) {
            throw new RuntimeException('LOO template current version row not found (document_versions).');
        }

        $templateFileId = (int) ($ver->file_id ?? 0);
        if ($templateFileId <= 0) {
            throw new RuntimeException('LOO template current version missing file_id.');
        }

        $templateVersion = (int) ($ver->version_no ?? 1);

        // Decide whether to generate / regenerate
        $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);
        $prevTplVer = (int) ($payload['template_version'] ?? 0);
        $prevTplFileId = (int) ($payload['template_file_id'] ?? 0);

        $generatedAt = now();

        $numbers = $this->docNumber->generate(self::DOC_CODE_LOO, $generatedAt);
        $recordNo = (string) ($numbers['record_no'] ?? '');

        // ✅ simpan FULL untuk metadata/payload
        $formCodeFull = (string) ($numbers['form_code'] ?? '');

        // ✅ tapi untuk DOCX footer kamu, isi ${form_code} HARUS tanggal saja
        $formCodeDate = $generatedAt->format('d-m-y'); // contoh: 19-02-26

        $revisionNo = (int) ($numbers['revision_no'] ?? 0);

        $client = (array) ($payload['client'] ?? []);

        // ambil semua sample_id dari itemsSnapshot
        $sampleIds = array_values(array_unique(array_filter(array_map(
            fn($it) => (int) ($it['sample_id'] ?? 0),
            $itemsSnapshot
        ))));

        $prevRevision = (int) ($payload['revision_no'] ?? -1);

        $alreadyGenerated = $pdfFileId > 0;
        $templateChanged = ($prevTplVer !== $templateVersion) || ($prevTplFileId !== $templateFileId);
        $revisionChanged = ($prevRevision !== $revisionNo);

        $shouldGenerate = $forceRegenerate || !$alreadyGenerated || $templateChanged || $revisionChanged;

        if (!$shouldGenerate) {
            // still normalize numbering snapshot if missing (without regenerating)
            if (empty($payload['record_no'])) $payload['record_no'] = $recordNo;
            if (empty($payload['form_code'])) $payload['form_code'] = $formCodeFull;

            $loa->payload = $payload;
            if (empty($loa->generated_at)) $loa->generated_at = now();
            return;
        }

        // Make sure signatures loaded for QR/checkbox placeholders, and backfill missing signature_hash
        $loa->loadMissing(['signatures']);

        $hashBackfilled = false;
        try {
            foreach ($loa->signatures as $sig) {
                $hash = (string) data_get($sig, 'signature_hash', '');
                if ($hash === '') {
                    $sig->signature_hash = hash('sha256', Str::uuid()->toString());
                    $sig->updated_at = now();
                    $sig->save();
                    $hashBackfilled = true;
                }
            }

            if ($hashBackfilled) {
                $loa->load('signatures');
            }
        } catch (\Throwable $e) {
            // do not block generation
        }

        // Fetch template bytes from DB
        /** @var FileBlob $tpl */
        $tpl = FileBlob::query()->where('file_id', $templateFileId)->firstOrFail();

        $raw = $tpl->bytes ?? null;

        // ✅ Postgres bytea can come back as a stream resource
        if (is_resource($raw)) {
            // try read from current pointer, then rewind as fallback
            $templateBytes = stream_get_contents($raw);
            if ($templateBytes === false || $templateBytes === '') {
                @rewind($raw);
                $templateBytes = stream_get_contents($raw);
            }
            $templateBytes = is_string($templateBytes) ? $templateBytes : '';
        } else {
            $templateBytes = is_string($raw) ? $raw : '';
        }

        if ($templateBytes === '') {
            throw new RuntimeException('LOO template file bytes are empty or unreadable.');
        }

        // Build placeholder vars (best-effort; template can pick what it needs)
        $client = (array) ($payload['client'] ?? []);

        $vars = [
            // numbering
            'record_no' => $recordNo,

            // ✅ untuk footer prefix statis: FORM/...Rev00.${form_code}
            'form_code' => $formCodeDate,

            // opsional kalau suatu saat butuh full code di docx
            'form_code_full' => $formCodeFull,

            // identifiers
            'loo_number' => $number,
            'loa_number' => $number,
            'generated_date' => $generatedAt->format('d/m/Y'),

            // client
            'client_name' => (string) ($client['name'] ?? ''),
            'client_organization' => (string) ($client['organization'] ?? ''),
            'client_email' => (string) ($client['email'] ?? ''),
            'client_phone' => (string) ($client['phone'] ?? ''),
        ];

        // ✅ tambahkan vars baru untuk Metode Uji, Jenis Sampel, dst
        $vars = array_merge($vars, $this->buildLooDocMetaVars($itemsSnapshot, $sampleIds));

        // Signature placeholders (optional)
        try {
            foreach ($loa->signatures as $sig) {
                $role = strtoupper((string) ($sig->role_code ?? ''));
                if ($role === '') continue;

                $vars["sig_{$role}_hash"] = (string) ($sig->signature_hash ?? '');
                $vars["sig_{$role}_signed_at"] = $sig->signed_at ? $sig->signed_at->format('d/m/Y H:i') : '';
                $vars["sig_{$role}_signed"] = $sig->signed_at ? '1' : '0';
            }
        } catch (\Throwable $e) {
            // ignore
        }

        // Build table rows for DOCX cloneRow
        // Convention: template uses ${item_no} as clone key.
        $rows = [
            'item_no' => [],
        ];

        foreach ($itemsSnapshot as $it) {
            $no = (string) ($it['no'] ?? '');

            $rows['item_no'][] = [
                // ✅ template sering pakai ${no}
                'no' => $no,

                // ✅ tetap support ${item_no} (punya kamu sekarang)
                'item_no' => $no,

                'sample_id' => (string) ($it['sample_id'] ?? ''),
                'lab_sample_code' => (string) ($it['lab_sample_code'] ?? ''),
                'sample_type' => (string) ($it['sample_type'] ?? ''),
                'parameters' => $this->formatParametersForDocx($it['parameters'] ?? []),
            ];
        }

        // Render merged DOCX bytes
        $mergedDocxBytes = $this->docx->renderBytes($templateBytes, $vars, $rows);

        // Convert DOCX->PDF bytes
        $pdfBytes = $this->docxToPdf->convertBytes($mergedDocxBytes);

        // Store to DB (files)
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', str_replace(['/', '\\'], '_', trim($number))) ?: 'loo';
        $stamp = now()->format('YmdHis');

        $docxName = "LOO-{$safe}-{$stamp}.docx";
        $pdfName = "LOO-{$safe}-{$stamp}.pdf";

        $docxFileId = $this->files->storeBytes(
            $mergedDocxBytes,
            $docxName,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'docx',
            $actorStaffId
        );

        $newPdfFileId = $this->files->storeBytes(
            $pdfBytes,
            $pdfName,
            'application/pdf',
            'pdf',
            $actorStaffId
        );

        // Snapshot in payload
        $payload['pdf_generated_at'] = now()->toISOString();
        $payload['pdf_file_id'] = $newPdfFileId;
        $payload['docx_file_id'] = $docxFileId;

        $payload['record_no'] = $recordNo;
        $payload['form_code'] = $formCodeFull;
        $payload['revision_no'] = $revisionNo;

        $payload['template_version'] = $templateVersion;
        $payload['template_file_id'] = $templateFileId;
        $payload['doc_code'] = self::DOC_CODE_LOO;

        // Helpful for FE (optional)
        $payload['download_url'] = url("/api/v1/files/{$newPdfFileId}");

        // generated_documents snapshot (if table exists) — mirror COA finalize style
        if (Schema::hasTable('generated_documents')) {
            try {
                DB::table('generated_documents')
                    ->where('entity_type', 'loo')
                    ->where('entity_id', (int) $loa->lo_id)
                    ->where('is_active', true)
                    ->update([
                        'is_active' => false,
                        'updated_at' => now(),
                    ]);

                DB::table('generated_documents')->insert([
                    'doc_code' => self::DOC_CODE_LOO,
                    'entity_type' => 'loo',
                    'entity_id' => (int) $loa->lo_id,
                    'record_no' => $recordNo,
                    'form_code' => $formCodeFull,
                    'revision_no' => $revisionNo,
                    'template_version' => $templateVersion,
                    'file_pdf_id' => $newPdfFileId,
                    'file_docx_id' => $docxFileId,
                    'generated_by' => $actorStaffId,
                    'generated_at' => now(),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (\Throwable $e) {
                // do not block
            }
        }

        // Keep in-memory updated; caller will save()
        $loa->payload = $payload;

        if (empty($loa->generated_at)) {
            $loa->generated_at = now();
        }
    }

    private function formatParametersForDocx($params): string
    {
        if (!is_array($params)) return '';

        $lines = [];
        foreach ($params as $p) {
            if (is_string($p)) {
                $lines[] = $p;
                continue;
            }
            if (is_array($p)) {
                $code = (string) ($p['code'] ?? '');
                $name = (string) ($p['name'] ?? '');
                $label = trim($code . ($name !== '' ? " - {$name}" : ''));
                if ($label !== '') $lines[] = $label;
            }
        }

        // Newlines usually render as line breaks in PhpWord TemplateProcessor
        return implode("\n", $lines);
    }

    private function buildLooDocMetaVars(array $itemsSnapshot, array $sampleIds): array
    {
        // ✅ jumlah sampel: selalu bisa dihitung dari items
        $qty = count($itemsSnapshot);

        // ✅ jenis sampel: ambil unik dari itemsSnapshot
        $types = [];
        foreach ($itemsSnapshot as $it) {
            $t = trim((string) ($it['sample_type'] ?? ''));
            if ($t !== '') $types[$t] = true;
        }
        $sampleType = implode(', ', array_keys($types));

        // ✅ metode uji: best-effort (kalau nggak ketemu, tetap replace jadi kosong)
        $method = $this->inferTestMethodFromSamples($sampleIds);

        // ✅ tanggal: best-effort dari samples.created_at (paling aman karena hampir pasti ada)
        $received = $this->pickMinDateFromSamples($sampleIds, ['received_at', 'verified_at', 'created_at']);
        $testingStart = $this->pickMinDateFromSamples($sampleIds, ['testing_started_at', 'analysis_started_at']);

        return [
            'test_method' => $method,
            'sample_type' => $sampleType,
            'sample_qty' => (string) $qty,
            'received_date' => $received ? $received->format('d/m/Y') : '',
            'testing_start_date' => $testingStart ? $testingStart->format('d/m/Y') : '',
        ];
    }

    private function pickMinDateFromSamples(array $sampleIds, array $preferredCols): ?\Illuminate\Support\Carbon
    {
        if (count($sampleIds) === 0) return null;
        if (!\Illuminate\Support\Facades\Schema::hasTable('samples')) return null;

        foreach ($preferredCols as $col) {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('samples', $col)) continue;

            $min = \Illuminate\Support\Facades\DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->whereNotNull($col)
                ->min($col);

            if ($min) {
                try {
                    return \Illuminate\Support\Carbon::parse($min);
                } catch (\Throwable) {
                }
            }
        }

        return null;
    }

    private function inferTestMethodFromSamples(array $sampleIds): string
    {
        if (count($sampleIds) === 0) return '';
        if (!\Illuminate\Support\Facades\Schema::hasTable('samples')) return '';

        // kalau ada kolom workflow_group, pakai itu
        if (\Illuminate\Support\Facades\Schema::hasColumn('samples', 'workflow_group')) {
            $groups = \Illuminate\Support\Facades\DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->whereNotNull('workflow_group')
                ->distinct()
                ->pluck('workflow_group')
                ->map(fn($x) => (string) $x)
                ->filter()
                ->values()
                ->all();

            if (count($groups) > 0) {
                $map = [
                    'pcr_sars_cov_2' => 'PCR SARS-CoV-2',
                    'pcr' => 'PCR',
                    'wgs' => 'Whole Genome Sequencing (WGS)',
                    'elisa' => 'ELISA',
                    'default' => 'General',
                ];

                $labels = [];
                foreach ($groups as $g) $labels[] = $map[$g] ?? strtoupper(str_replace('_', ' ', $g));
                return implode(', ', array_values(array_unique($labels)));
            }
        }

        return '';
    }

    public function ensureDraftForSamples(array $sampleIds, int $actorStaffId): LetterOfOrder
    {
        $sampleIds = array_values(array_unique(array_map('intval', $sampleIds)));
        $sampleIds = array_values(array_filter($sampleIds, fn($x) => $x > 0));

        if (count($sampleIds) <= 0) {
            throw new RuntimeException('sample_ids is required.');
        }

        return DB::transaction(function () use ($sampleIds, $actorStaffId) {
            // 1) load samples
            $samples = DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->get([
                    'sample_id',
                    'client_id',
                    'lab_sample_code',
                    'sample_type',
                    'verified_at',
                    'request_status',
                ]);

            if ($samples->count() !== count($sampleIds)) {
                throw new RuntimeException('Some samples not found.');
            }

            // 2) verification + lab code gate
            foreach ($samples as $s) {
                $sid = (int) $s->sample_id;

                if (empty($s->verified_at)) {
                    throw new RuntimeException("Sample {$sid} is not verified yet.");
                }
                if (empty($s->lab_sample_code)) {
                    throw new RuntimeException("Sample {$sid} has no lab_sample_code yet.");
                }
            }

            // 3) load parameters from request pivot
            $paramRows = DB::table('sample_requested_parameters as srp')
                ->join('parameters as p', 'p.parameter_id', '=', 'srp.parameter_id')
                ->whereIn('srp.sample_id', $sampleIds)
                ->orderBy('p.code')
                ->get([
                    'srp.sample_id',
                    'p.parameter_id',
                    'p.code',
                    'p.name',
                ]);

            $paramsBySample = [];
            foreach ($paramRows as $r) {
                $sid = (int) $r->sample_id;
                if (!isset($paramsBySample[$sid])) $paramsBySample[$sid] = [];
                $paramsBySample[$sid][] = [
                    'parameter_id' => (int) $r->parameter_id,
                    'code' => (string) ($r->code ?? ''),
                    'name' => (string) ($r->name ?? ''),
                ];
            }

            // 4) build items snapshot
            $sortedSamples = $samples->sortBy(function ($s) {
                return (string) ($s->lab_sample_code ?? '');
            })->values();

            $items = [];
            foreach ($sortedSamples as $idx => $s) {
                $sid = (int) $s->sample_id;
                $items[] = [
                    'no' => $idx + 1,
                    'sample_id' => $sid,
                    'lab_sample_code' => (string) $s->lab_sample_code,
                    'sample_type' => $s->sample_type ?? null,
                    'parameters' => $paramsBySample[$sid] ?? [],
                ];
            }

            // IMPORTANT:
            // uq_lo_sample forces UNIQUE(sample_id) in letters_of_order.
            // We must use a stable anchor sample_id and reuse existing LoO if present.
            $anchorSampleId = (int) $sortedSamples->first()->sample_id;

            $existing = $this->findExistingByAnchorSampleId($anchorSampleId);
            if ($existing) {
                // If already locked, just return it (cannot change content).
                if ($existing->loa_status === 'locked') {
                    $existing->loadMissing(['signatures']);
                    $payload = is_array($existing->payload) ? $existing->payload : (array) $existing->payload;
                    $existing->setRelation('items', $this->buildItemsModels((int) $existing->lo_id, (array) ($payload['items'] ?? [])));
                    return $existing;
                }

                // Refresh payload so UI reflects latest selection
                $payload = is_array($existing->payload) ? $existing->payload : (array) $existing->payload;

                // Keep existing number for consistency
                $number = (string) ($existing->number ?? '');
                if ($number === '') {
                    $number = $this->numberGen->nextNumber();
                    $existing->number = $number;
                }

                $payload['loo_number'] = $number;
                $payload['loa_number'] = $number;
                $payload['sample_ids'] = $sampleIds;
                $payload['items'] = $items;

                // generated_at snapshot (safe)
                $payload['generated_at'] = $payload['generated_at'] ?? now()->toISOString();

                // Decide regeneration:
                // - draft: regenerate to match latest items
                // - signed_internal/sent_to_client: do NOT regenerate automatically (preserve signed doc intent)
                $forceRegenerate = ((string) $existing->loa_status === 'draft');

                $this->ensurePdfInDb($existing, $payload, $items, $actorStaffId, $forceRegenerate);

                $existing->payload = $payload;
                $existing->updated_at = now();
                $existing->save();

                $existing->loadMissing(['signatures']);
                $existing->setRelation('items', $this->buildItemsModels((int) $existing->lo_id, $items));

                return $existing;
            }

            // 5) create new draft (only if none exists)
            $number = $this->numberGen->nextNumber();

            $payload = [
                'loo_number' => $number,
                'loa_number' => $number, // backward compat
                'generated_at' => now()->toISOString(),

                // client identity intentionally omitted
                'client' => [
                    'name' => null,
                    'organization' => null,
                    'email' => null,
                    'phone' => null,
                ],

                'sample_ids' => $sampleIds,
                'items' => $items,

                // Step 12 DB-backed outputs
                'pdf_generated_at' => null,
                'pdf_file_id' => null,
                'docx_file_id' => null,
                'record_no' => null,
                'form_code' => null,
                'revision_no' => null,
                'template_version' => null,
                'template_file_id' => null,
                'download_url' => null,
            ];

            try {
                $loa = LetterOfOrder::query()->create([
                    'sample_id' => $anchorSampleId,
                    'number' => $number,
                    'generated_at' => now(),
                    'generated_by' => $actorStaffId,

                    // legacy placeholder (some old code expects file_url present)
                    'file_url' => $this->forceReportsLooPath($this->pdf->buildPath($number), $number),

                    'loa_status' => 'draft',
                    'payload' => $payload,
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            } catch (\Throwable $e) {
                // If race / duplicate happens anyway, fetch existing and return it
                $existing2 = $this->findExistingByAnchorSampleId($anchorSampleId);
                if ($existing2) {
                    $existing2->loadMissing(['signatures']);
                    $p2 = is_array($existing2->payload) ? $existing2->payload : (array) $existing2->payload;
                    $existing2->setRelation('items', $this->buildItemsModels((int) $existing2->lo_id, (array) ($p2['items'] ?? [])));
                    return $existing2;
                }
                throw $e;
            }

            // 6) Persist items only if items table is usable (optional)
            if ($this->isItemsTableUsable()) {
                foreach ($items as $it) {
                    DB::table('letter_of_order_items')->insert([
                        'lo_id' => (int) $loa->lo_id,
                        'sample_id' => (int) $it['sample_id'],
                        'lab_sample_code' => (string) $it['lab_sample_code'],
                        'parameters' => json_encode($it['parameters']),
                        'created_at' => now(),
                        'updated_at' => null,
                    ]);
                }
            }

            /**
             * ✅ Promote samples included in LOO
             * - mark as generated (so they disappear from LOO Generator)
             * - ensure lab_sample_code exists (legacy-safe)
             */
            $now = now();

            // lock rows to avoid double-assign in concurrent LOO generates
            $samples = \App\Models\Sample::query()
                ->whereIn('sample_id', $sampleIds)
                ->lockForUpdate()
                ->get(['sample_id', 'lab_sample_code']);

            $codeGen = app(\App\Services\LabSampleCodeGenerator::class);

            foreach ($samples as $s) {
                $code = (string) ($s->lab_sample_code ?? '');
                if (trim($code) === '') {
                    $code = $codeGen->nextCode();
                    \App\Models\Sample::query()
                        ->where('sample_id', $s->sample_id)
                        ->update([
                            'lab_sample_code' => $code,
                        ]);
                }

                // mark as included in LOO
                \App\Models\Sample::query()
                    ->where('sample_id', $s->sample_id)
                    ->update([
                        'loa_generated_at' => $now,
                        'loa_generated_by_staff_id' => $actorStaffId,
                    ]);
            }

            // 7) create signature slots (pre-generate signature_hash so QR is visible on draft PDF)
            $roles = DB::table('loa_signature_roles')
                ->orderBy('sort_order')
                ->get(['role_code']);

            foreach ($roles as $r) {
                LooSignature::query()->create([
                    'lo_id' => (int) $loa->lo_id,
                    'role_code' => $r->role_code,
                    'signed_by_staff' => null,
                    'signed_by_client' => null,
                    'signed_at' => null,

                    // QR depends on this hash; generate at slot creation time (even before signing)
                    'signature_hash' => hash('sha256', Str::uuid()->toString()),

                    'note' => null,
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            }

            // ✅ generate PDF immediately (DB-backed) so preview works right away
            $loa->loadMissing(['signatures']);
            $this->ensurePdfInDb($loa, $payload, $items, $actorStaffId, true);
            $loa->updated_at = now();
            $loa->save();

            // attach relations safely
            $loa->loadMissing(['signatures']);
            $loa->setRelation('items', $this->buildItemsModels((int) $loa->lo_id, $items));
            return $loa;
        }, 3);
    }

    public function ensureDraftForSample(int $sampleId, int $actorStaffId): LetterOfOrder
    {
        return $this->ensureDraftForSamples([$sampleId], $actorStaffId);
    }

    public function signInternal(int $loId, int $actorStaffId, string $roleCode): LetterOfOrder
    {
        return DB::transaction(function () use ($loId, $actorStaffId, $roleCode) {
            /** @var LetterOfOrder $loa */
            $loa = LetterOfOrder::query()->where('lo_id', $loId)->firstOrFail();

            if ($loa->loa_status === 'locked') {
                throw new RuntimeException('LoA already locked.');
            }

            $sig = LooSignature::query()
                ->where('lo_id', $loId)
                ->where('role_code', $roleCode)
                ->firstOrFail();

            if ($sig->signed_at) {
                $loa->loadMissing(['signatures']);
                $payload = is_array($loa->payload) ? $loa->payload : (array) $loa->payload;
                $loa->setRelation('items', $this->buildItemsModels((int) $loa->lo_id, (array) ($payload['items'] ?? [])));
                return $loa->refresh();
            }

            $sig->signed_by_staff = $actorStaffId;
            $sig->signed_at = now();

            // ✅ don't overwrite existing hash (QR must stay stable)
            if (empty($sig->signature_hash)) {
                $sig->signature_hash = hash('sha256', Str::uuid()->toString());
            }

            $sig->updated_at = now();
            $sig->save();

            // Re-check OM + LH signatures
            $sigs = LooSignature::query()
                ->where('lo_id', $loId)
                ->whereIn('role_code', ['OM', 'LH'])
                ->get(['role_code', 'signed_at']);

            $signedMap = [];
            foreach ($sigs as $row) {
                $signedMap[(string) $row->role_code] = !empty($row->signed_at);
            }

            $omSigned = (bool) ($signedMap['OM'] ?? false);
            $lhSigned = (bool) ($signedMap['LH'] ?? false);
            $allSigned = $omSigned && $lhSigned;

            if ($allSigned) {
                if ($loa->loa_status === 'draft') {
                    $loa->loa_status = 'signed_internal';
                }

                $payload = is_array($loa->payload) ? $loa->payload : (array) $loa->payload;

                // regen once after both signed, so checkbox markers are correct
                $items = (array) ($payload['items'] ?? []);
                $this->ensurePdfInDb($loa, $payload, $items, $actorStaffId, true);

                $loa->updated_at = now();
                $loa->save();
            }

            $loa->loadMissing(['signatures']);
            $payload = is_array($loa->payload) ? $loa->payload : (array) $loa->payload;
            $loa->setRelation('items', $this->buildItemsModels((int) $loa->lo_id, (array) ($payload['items'] ?? [])));

            return $loa->refresh();
        }, 3);
    }

    public function sendToClient(int $loId, int $actorStaffId): LetterOfOrder
    {
        return DB::transaction(function () use ($loId) {
            $loa = LetterOfOrder::query()->where('lo_id', $loId)->firstOrFail();

            if (!in_array($loa->loa_status, ['signed_internal'], true)) {
                throw new RuntimeException('LoA must be signed_internal before sending to client.');
            }

            $payload = is_array($loa->payload) ? $loa->payload : (array) $loa->payload;

            $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);
            if ($pdfFileId <= 0) {
                throw new RuntimeException('PDF is not generated yet. Ensure OM & LH have signed.');
            }

            $loa->loa_status = 'sent_to_client';
            $loa->sent_to_client_at = now();
            $loa->updated_at = now();
            $loa->save();

            $loa->loadMissing(['signatures']);
            $loa->setRelation('items', $this->buildItemsModels((int) $loa->lo_id, (array) ($payload['items'] ?? [])));

            return $loa;
        }, 3);
    }

    public function clientSign(int $loId, int $clientId): LetterOfOrder
    {
        return DB::transaction(function () use ($loId, $clientId) {
            $loa = LetterOfOrder::query()->where('lo_id', $loId)->firstOrFail();

            if (!in_array($loa->loa_status, ['sent_to_client'], true)) {
                throw new RuntimeException('LoA must be sent_to_client before client can sign.');
            }

            $sig = LooSignature::query()
                ->where('lo_id', $loId)
                ->where('role_code', 'CLIENT')
                ->firstOrFail();

            if (!$sig->signed_at) {
                $sig->signed_by_client = $clientId;
                $sig->signed_at = now();

                // QR stable token
                if (empty($sig->signature_hash)) {
                    $sig->signature_hash = hash('sha256', Str::uuid()->toString());
                }

                $sig->updated_at = now();
                $sig->save();
            }

            $loa->loa_status = 'locked';
            $loa->client_signed_at = now();
            $loa->locked_at = now();
            $loa->updated_at = now();
            $loa->save();

            $payload = is_array($loa->payload) ? $loa->payload : (array) $loa->payload;
            $loa->loadMissing(['signatures']);
            $loa->setRelation('items', $this->buildItemsModels((int) $loa->lo_id, (array) ($payload['items'] ?? [])));

            return $loa->refresh();
        }, 3);
    }
}
