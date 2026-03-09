<?php

namespace App\Services;

use App\Models\FileBlob;
use App\Models\LetterOfOrder;
use App\Models\LetterOfOrderItem;
use App\Models\LooSignature;
use Illuminate\Support\Carbon;
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
        private readonly LooPdfService $pdf,
        private readonly FileStoreService $files,
        private readonly DocNumberService $docNumber,
        private readonly DocxTemplateRenderService $docx,
        private readonly DocxToPdfConverter $docxToPdf,
    ) {}

    private function isItemsTableUsable(): bool
    {
        $table = 'letter_of_order_items';

        if (!Schema::hasTable($table)) {
            return false;
        }

        foreach (['lo_id', 'sample_id', 'lab_sample_code', 'parameters'] as $col) {
            if (!Schema::hasColumn($table, $col)) {
                return false;
            }
        }

        return true;
    }

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

    private function findExistingByAnchorSampleId(int $anchorSampleId): ?LetterOfOrder
    {
        if ($anchorSampleId <= 0) {
            return null;
        }

        return LetterOfOrder::query()
            ->where('sample_id', $anchorSampleId)
            ->orderByDesc('lo_id')
            ->first();
    }

    private function forceReportsLooPath(string $pathOrAnything, string $looNumber): string
    {
        $path = str_replace('\\', '/', trim((string) $pathOrAnything));

        if (preg_match('/^https?:\/\//i', $path)) {
            $urlPath = parse_url($path, PHP_URL_PATH);
            if (is_string($urlPath) && $urlPath !== '') {
                $path = $urlPath;
            }
        }

        $path = ltrim($path, '/');

        if (str_starts_with($path, 'letters/loo/')) {
            $path = preg_replace('#^letters/loo/#', 'reports/loo/', $path);
        }

        if (str_starts_with($path, 'reports/loo/')) {
            return $path;
        }

        $year = now()->format('Y');
        $safe = str_replace(['/', '\\'], '_', trim($looNumber));
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $safe) ?: 'loo';

        return "reports/loo/{$year}/{$safe}.pdf";
    }

    private function normalizePayload(mixed $payload): array
    {
        return is_array($payload) ? $payload : (array) $payload;
    }

    private function attachVirtualItems(LetterOfOrder $loa, ?array $itemsSnapshot = null): LetterOfOrder
    {
        $payload = $this->normalizePayload($loa->payload);
        $items = $itemsSnapshot ?? (array) ($payload['items'] ?? []);

        $loa->loadMissing(['signatures']);
        $loa->setRelation('items', $this->buildItemsModels((int) $loa->lo_id, $items));

        return $loa;
    }

    private function ensureSignatureHashes(LetterOfOrder $loa): void
    {
        $loa->loadMissing(['signatures']);

        try {
            $updated = false;

            foreach ($loa->signatures as $sig) {
                $hash = trim((string) data_get($sig, 'signature_hash', ''));
                if ($hash !== '') {
                    continue;
                }

                $sig->signature_hash = hash('sha256', Str::uuid()->toString());
                $sig->updated_at = now();
                $sig->save();

                $updated = true;
            }

            if ($updated) {
                $loa->load('signatures');
            }
        } catch (\Throwable) {
        }
    }

    private function extractSampleIdsFromItemsSnapshot(array $itemsSnapshot): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn($it) => (int) ($it['sample_id'] ?? 0),
            $itemsSnapshot
        ))));
    }

    private function detectDocumentVersionPk(): string
    {
        if (Schema::hasColumn('document_versions', 'doc_ver_id')) {
            return 'doc_ver_id';
        }

        if (Schema::hasColumn('document_versions', 'doc_version_id')) {
            return 'doc_version_id';
        }

        throw new RuntimeException('document_versions primary key column not found.');
    }

    private function loadCurrentTemplateMeta(): array
    {
        $docQ = DB::table('documents')
            ->where('doc_code', self::DOC_CODE_LOO)
            ->where('kind', 'template')
            ->where('is_active', true);

        $cols = ['doc_id', 'doc_code'];
        if (Schema::hasColumn('documents', 'version_current_id')) {
            $cols[] = 'version_current_id';
        }
        if (Schema::hasColumn('documents', 'current_version_id')) {
            $cols[] = 'current_version_id';
        }

        $doc = $docQ->first($cols);

        if (!$doc) {
            throw new RuntimeException('LOO template registry not found or inactive.');
        }

        $docVerId = (int) ($doc->version_current_id ?? 0);
        if ($docVerId <= 0) {
            $docVerId = (int) ($doc->current_version_id ?? 0);
        }
        if ($docVerId <= 0) {
            throw new RuntimeException('LOO template has no uploaded DOCX yet.');
        }

        $verPk = $this->detectDocumentVersionPk();

        $ver = DB::table('document_versions')
            ->where($verPk, $docVerId)
            ->first([$verPk, 'version_no', 'file_id']);

        if (!$ver) {
            throw new RuntimeException('LOO template current version row not found.');
        }

        $templateFileId = (int) ($ver->file_id ?? 0);
        if ($templateFileId <= 0) {
            throw new RuntimeException('LOO template current version missing file_id.');
        }

        return [
            'template_file_id' => $templateFileId,
            'template_version' => (int) ($ver->version_no ?? 1),
        ];
    }

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

        $templateMeta = $this->loadCurrentTemplateMeta();
        $templateFileId = (int) $templateMeta['template_file_id'];
        $templateVersion = (int) $templateMeta['template_version'];

        $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);
        $prevTplVer = (int) ($payload['template_version'] ?? 0);
        $prevTplFileId = (int) ($payload['template_file_id'] ?? 0);
        $prevRevision = (int) ($payload['revision_no'] ?? -1);

        $generatedAt = now();
        $generatedAtIso = $generatedAt->toISOString();

        $numbers = $this->docNumber->generate(self::DOC_CODE_LOO, $generatedAt);
        $recordNo = (string) ($numbers['record_no'] ?? '');
        $formCodeFull = (string) ($numbers['form_code'] ?? '');
        $formCodeDate = $generatedAt->format('d-m-y');
        $revisionNo = (int) ($numbers['revision_no'] ?? 0);

        $sampleIds = $this->extractSampleIdsFromItemsSnapshot($itemsSnapshot);

        $alreadyGenerated = $pdfFileId > 0;
        $templateChanged = ($prevTplVer !== $templateVersion) || ($prevTplFileId !== $templateFileId);
        $revisionChanged = ($prevRevision !== $revisionNo);

        $shouldGenerate = $forceRegenerate || !$alreadyGenerated || $templateChanged || $revisionChanged;

        if (!$shouldGenerate) {
            if (empty($payload['record_no'])) {
                $payload['record_no'] = $recordNo;
            }
            if (empty($payload['form_code'])) {
                $payload['form_code'] = $formCodeFull;
            }

            $loa->payload = $payload;

            if (empty($loa->generated_at)) {
                $loa->generated_at = $generatedAt;
            }

            return;
        }

        $this->ensureSignatureHashes($loa);

        /** @var FileBlob $tpl */
        $tpl = FileBlob::query()->where('file_id', $templateFileId)->firstOrFail();

        $templateBytes = $this->readPossiblyStreamedBytes($tpl->bytes ?? null);
        if ($templateBytes === '') {
            throw new RuntimeException('LOO template file bytes are empty or unreadable.');
        }

        $client = (array) ($payload['client'] ?? []);

        $vars = [
            'record_no' => $recordNo,
            'form_code' => $formCodeFull,
            'form_code_full' => $formCodeFull,
            'form_code_date' => $formCodeDate,
            'loo_number' => $number,
            'loa_number' => $number,
            'generated_date' => $generatedAt->format('d/m/Y'),
            'client_name' => (string) ($client['name'] ?? ''),
            'client_organization' => (string) ($client['organization'] ?? ''),
            'client_email' => (string) ($client['email'] ?? ''),
            'client_phone' => (string) ($client['phone'] ?? ''),
        ];

        $vars = array_merge($vars, $this->buildLooDocMetaVars($itemsSnapshot, $sampleIds, $generatedAt));

        try {
            foreach ($loa->signatures as $sig) {
                $role = strtoupper((string) ($sig->role_code ?? ''));
                if ($role === '') {
                    continue;
                }

                $vars["sig_{$role}_hash"] = (string) ($sig->signature_hash ?? '');
                $vars["sig_{$role}_signed_at"] = $sig->signed_at ? $sig->signed_at->format('d/m/Y H:i') : '';
                $vars["sig_{$role}_signed"] = $sig->signed_at ? '1' : '0';
            }
        } catch (\Throwable) {
        }

        $rows = ['item_no' => []];

        foreach ($itemsSnapshot as $it) {
            $no = (string) ($it['no'] ?? '');

            $rows['item_no'][] = [
                'no' => $no,
                'item_no' => $no,
                'sample_id' => (string) ($it['sample_id'] ?? ''),
                'lab_sample_code' => (string) ($it['lab_sample_code'] ?? ''),
                'sample_type' => (string) ($it['sample_type'] ?? ''),
                'parameters' => $this->formatParametersForDocx($it['parameters'] ?? []),
            ];
        }

        $mergedDocxBytes = $this->docx->renderBytes($templateBytes, $vars, $rows);
        $pdfBytes = $this->docxToPdf->convertBytes($mergedDocxBytes);

        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', str_replace(['/', '\\'], '_', trim($number))) ?: 'loo';
        $stamp = $generatedAt->format('YmdHis');

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

        $payload['pdf_generated_at'] = $generatedAtIso;
        $payload['pdf_file_id'] = $newPdfFileId;
        $payload['docx_file_id'] = $docxFileId;
        $payload['record_no'] = $recordNo;
        $payload['form_code'] = $formCodeFull;
        $payload['form_code_date'] = $formCodeDate;
        $payload['revision_no'] = $revisionNo;
        $payload['template_version'] = $templateVersion;
        $payload['template_file_id'] = $templateFileId;
        $payload['doc_code'] = self::DOC_CODE_LOO;
        $payload['download_url'] = url("/api/v1/files/{$newPdfFileId}");

        if (Schema::hasTable('generated_documents')) {
            try {
                DB::table('generated_documents')
                    ->where('entity_type', 'loo')
                    ->where('entity_id', (int) $loa->lo_id)
                    ->where('is_active', true)
                    ->update([
                        'is_active' => false,
                        'updated_at' => $generatedAt,
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
                    'generated_at' => $generatedAt,
                    'is_active' => true,
                    'created_at' => $generatedAt,
                    'updated_at' => $generatedAt,
                ]);
            } catch (\Throwable) {
            }
        }

        $loa->payload = $payload;

        if (empty($loa->generated_at)) {
            $loa->generated_at = $generatedAt;
        }
    }

    private function readPossiblyStreamedBytes(mixed $raw): string
    {
        if (is_resource($raw)) {
            $bytes = stream_get_contents($raw);

            if ($bytes === false || $bytes === '') {
                @rewind($raw);
                $bytes = stream_get_contents($raw);
            }

            return is_string($bytes) ? $bytes : '';
        }

        return is_string($raw) ? $raw : '';
    }

    private function formatParametersForDocx(mixed $params): string
    {
        if (!is_array($params)) {
            return '';
        }

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

                if ($label !== '') {
                    $lines[] = $label;
                }
            }
        }

        return implode("\n", $lines);
    }

    private function buildLooDocMetaVars(array $itemsSnapshot, array $sampleIds, Carbon $generatedAt): array
    {
        $qty = count($itemsSnapshot);

        $types = [];
        foreach ($itemsSnapshot as $it) {
            $type = trim((string) ($it['sample_type'] ?? ''));
            if ($type !== '') {
                $types[$type] = true;
            }
        }

        $uniqueTypes = array_keys($types);
        $sampleType = count($uniqueTypes) === 1 ? (string) $uniqueTypes[0] : '';

        $method = $this->resolveTestMethodFromSamples($sampleIds);

        $received = $this->pickMinDateFromSamples($sampleIds, [
            'admin_received_from_client_at',
            'physically_received_at',
            'received_at',
            'verified_at',
            'created_at',
        ]);

        return [
            'test_method' => $method,
            'sample_type' => $sampleType,
            'sample_qty' => (string) $qty,
            'received_date' => $received ? $received->format('d/m/Y') : '',
            'testing_start_date' => $generatedAt->format('d/m/Y'),
        ];
    }

    private function pickMinDateFromSamples(array $sampleIds, array $preferredCols): ?Carbon
    {
        $sampleIds = array_values(array_filter(array_map('intval', $sampleIds), fn($x) => $x > 0));

        if (count($sampleIds) === 0 || !Schema::hasTable('samples')) {
            return null;
        }

        foreach ($preferredCols as $col) {
            if (!Schema::hasColumn('samples', $col)) {
                continue;
            }

            $min = DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->whereNotNull($col)
                ->min($col);

            if ($min) {
                try {
                    return Carbon::parse($min);
                } catch (\Throwable) {
                }
            }
        }

        return null;
    }

    private function resolveTestMethodFromSamples(array $sampleIds): string
    {
        $sampleIds = array_values(array_filter(array_map('intval', $sampleIds), fn($x) => $x > 0));

        if (count($sampleIds) === 0 || !Schema::hasTable('samples')) {
            return '';
        }

        if (Schema::hasColumn('samples', 'method_id') && Schema::hasTable('methods')) {
            $rows = DB::table('samples as s')
                ->join('methods as m', 'm.method_id', '=', 's.method_id')
                ->whereIn('s.sample_id', $sampleIds)
                ->whereNotNull('s.method_id')
                ->distinct()
                ->get(['m.code', 'm.name']);

            $labels = [];

            foreach ($rows as $r) {
                $code = trim((string) ($r->code ?? ''));
                $name = trim((string) ($r->name ?? ''));
                $label = $this->formatMethodLabel($code, $name);

                if ($label !== '') {
                    $labels[$label] = true;
                }
            }

            $out = implode(', ', array_keys($labels));
            if ($out !== '') {
                return $out;
            }
        }

        $block = [
            'pcr',
            'sequencing',
            'rapid',
            'microbiology',
            'pcr sars-cov-2',
        ];

        foreach (['test_method', 'test_method_name', 'method_name'] as $col) {
            if (!Schema::hasColumn('samples', $col)) {
                continue;
            }

            $vals = DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->whereNotNull($col)
                ->distinct()
                ->pluck($col)
                ->map(fn($x) => trim((string) $x))
                ->filter()
                ->filter(function (string $value) use ($block) {
                    $key = strtolower(trim($value));
                    return $key !== '' && !in_array($key, $block, true);
                })
                ->values()
                ->all();

            if (count($vals) > 0) {
                return implode(', ', array_values(array_unique($vals)));
            }
        }

        return '';
    }

    private function formatMethodLabel(string $code, string $name): string
    {
        $code = trim($code);
        $name = trim($name);

        if ($name !== '') {
            return $name;
        }

        if ($code !== '') {
            return $code;
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
            $samples = DB::table('samples')
                ->whereIn('sample_id', $sampleIds)
                ->get([
                    'sample_id',
                    'client_id',
                    'request_batch_id',
                    'request_batch_item_no',
                    'request_batch_total',
                    'lab_sample_code',
                    'sample_type',
                    'verified_at',
                    'request_status',
                ]);

            if ($samples->count() !== count($sampleIds)) {
                throw new RuntimeException('Some samples not found.');
            }

            $clientIds = $samples->pluck('client_id')
                ->map(fn($x) => (int) $x)
                ->unique()
                ->values()
                ->all();

            if (count($clientIds) > 1) {
                throw new RuntimeException('All LOO items must belong to the same client.');
            }

            $batchIds = $samples->pluck('request_batch_id')
                ->map(fn($x) => trim((string) $x))
                ->filter()
                ->unique()
                ->values()
                ->all();

            if (count($batchIds) > 1) {
                throw new RuntimeException('All LOO items must belong to the same institutional batch.');
            }

            if (count($batchIds) === 1) {
                $expectedSet = DB::table('samples')
                    ->where('client_id', (int) $clientIds[0])
                    ->where('request_batch_id', (string) $batchIds[0])
                    ->when(
                        Schema::hasColumn('samples', 'batch_excluded_at'),
                        fn($q) => $q->whereNull('batch_excluded_at')
                    )
                    ->pluck('sample_id')
                    ->map(fn($x) => (int) $x)
                    ->sort()
                    ->values()
                    ->all();

                $providedSet = collect($sampleIds)
                    ->map(fn($x) => (int) $x)
                    ->sort()
                    ->values()
                    ->all();

                if ($expectedSet !== $providedSet) {
                    throw new RuntimeException('Institutional batch LOO must include all active samples in the batch.');
                }
            }

            foreach ($samples as $sample) {
                $sid = (int) $sample->sample_id;

                if (empty($sample->verified_at)) {
                    throw new RuntimeException("Sample {$sid} is not verified yet.");
                }

                if (empty($sample->lab_sample_code)) {
                    throw new RuntimeException("Sample {$sid} has no lab_sample_code yet.");
                }
            }

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
            foreach ($paramRows as $row) {
                $sid = (int) $row->sample_id;

                if (!isset($paramsBySample[$sid])) {
                    $paramsBySample[$sid] = [];
                }

                $paramsBySample[$sid][] = [
                    'parameter_id' => (int) $row->parameter_id,
                    'code' => (string) ($row->code ?? ''),
                    'name' => (string) ($row->name ?? ''),
                ];
            }

            $sortedSamples = $samples
                ->sortBy([
                    fn($sample) => trim((string) ($sample->request_batch_id ?? '')) !== '' ? 0 : 1,
                    fn($sample) => (int) ($sample->request_batch_item_no ?? 0),
                    fn($sample) => (string) ($sample->lab_sample_code ?? ''),
                    fn($sample) => (int) ($sample->sample_id ?? 0),
                ])
                ->values();

            $items = [];
            foreach ($sortedSamples as $idx => $sample) {
                $sid = (int) $sample->sample_id;

                $items[] = [
                    'no' => $idx + 1,
                    'sample_id' => $sid,
                    'lab_sample_code' => (string) $sample->lab_sample_code,
                    'sample_type' => $sample->sample_type ?? null,
                    'parameters' => $paramsBySample[$sid] ?? [],
                ];
            }

            $anchorSampleId = (int) $sortedSamples->first()->sample_id;
            $requestBatchId = $batchIds[0] ?? null;
            $batchTotal = count($sampleIds);

            $existing = $this->findExistingByAnchorSampleId($anchorSampleId);

            if ($existing) {
                if ($existing->loa_status === 'locked') {
                    return $this->attachVirtualItems($existing);
                }

                $payload = $this->normalizePayload($existing->payload);

                $number = (string) ($existing->number ?? '');
                if ($number === '') {
                    $number = $this->numberGen->nextNumber();
                    $existing->number = $number;
                }

                $payload['loo_number'] = $number;
                $payload['loa_number'] = $number;
                $payload['sample_ids'] = $sampleIds;
                $payload['items'] = $items;
                $payload['request_batch_id'] = $requestBatchId;
                $payload['batch_total'] = $batchTotal;
                $payload['generated_at'] = $payload['generated_at'] ?? now()->toISOString();

                $forceRegenerate = ((string) $existing->loa_status === 'draft');

                $this->ensurePdfInDb($existing, $payload, $items, $actorStaffId, $forceRegenerate);

                $existing->payload = $payload;
                $existing->updated_at = now();
                $existing->save();

                return $this->attachVirtualItems($existing, $items);
            }

            $number = $this->numberGen->nextNumber();

            $payload = [
                'loo_number' => $number,
                'loa_number' => $number,
                'generated_at' => now()->toISOString(),
                'client' => [
                    'name' => null,
                    'organization' => null,
                    'email' => null,
                    'phone' => null,
                ],
                'sample_ids' => $sampleIds,
                'items' => $items,
                'request_batch_id' => $requestBatchId,
                'batch_total' => $batchTotal,
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
                    'file_url' => $this->forceReportsLooPath($this->pdf->buildPath($number), $number),
                    'loa_status' => 'draft',
                    'payload' => $payload,
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            } catch (\Throwable $e) {
                $existing2 = $this->findExistingByAnchorSampleId($anchorSampleId);

                if ($existing2) {
                    return $this->attachVirtualItems($existing2);
                }

                throw $e;
            }

            if ($this->isItemsTableUsable()) {
                foreach ($items as $item) {
                    DB::table('letter_of_order_items')->insert([
                        'lo_id' => (int) $loa->lo_id,
                        'sample_id' => (int) $item['sample_id'],
                        'lab_sample_code' => (string) $item['lab_sample_code'],
                        'parameters' => json_encode($item['parameters']),
                        'created_at' => now(),
                        'updated_at' => null,
                    ]);
                }
            }

            $now = now();

            $sampleModels = \App\Models\Sample::query()
                ->whereIn('sample_id', $sampleIds)
                ->lockForUpdate()
                ->get(['sample_id', 'lab_sample_code']);

            $codeGen = app(\App\Services\LabSampleCodeGenerator::class);

            foreach ($sampleModels as $sample) {
                $code = (string) ($sample->lab_sample_code ?? '');

                if (trim($code) === '') {
                    $code = $codeGen->nextCode();

                    \App\Models\Sample::query()
                        ->where('sample_id', $sample->sample_id)
                        ->update(['lab_sample_code' => $code]);
                }

                \App\Models\Sample::query()
                    ->where('sample_id', $sample->sample_id)
                    ->update([
                        'loa_generated_at' => $now,
                        'loa_generated_by_staff_id' => $actorStaffId,
                    ]);
            }

            $roles = DB::table('loa_signature_roles')
                ->orderBy('sort_order')
                ->get(['role_code']);

            foreach ($roles as $role) {
                LooSignature::query()->create([
                    'lo_id' => (int) $loa->lo_id,
                    'role_code' => $role->role_code,
                    'signed_by_staff' => null,
                    'signed_by_client' => null,
                    'signed_at' => null,
                    'signature_hash' => hash('sha256', Str::uuid()->toString()),
                    'note' => null,
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            }

            $loa->loadMissing(['signatures']);
            $this->ensurePdfInDb($loa, $payload, $items, $actorStaffId, true);
            $loa->updated_at = now();
            $loa->save();

            return $this->attachVirtualItems($loa, $items);
        }, 3);
    }

    public function ensureDraftForSample(int $sampleId, int $actorStaffId): LetterOfOrder
    {
        return $this->ensureDraftForSamples([$sampleId], $actorStaffId);
    }

    public function signInternal(int $loId, int $actorStaffId, string $roleCode): LetterOfOrder
    {
        return DB::transaction(function () use ($loId, $actorStaffId, $roleCode) {
            $loa = LetterOfOrder::query()->where('lo_id', $loId)->firstOrFail();

            if ($loa->loa_status === 'locked') {
                throw new RuntimeException('LoA already locked.');
            }

            $sig = LooSignature::query()
                ->where('lo_id', $loId)
                ->where('role_code', $roleCode)
                ->firstOrFail();

            if ($sig->signed_at) {
                return $loa->refresh();
            }

            $sig->signed_by_staff = $actorStaffId;
            $sig->signed_at = now();

            if (empty($sig->signature_hash)) {
                $sig->signature_hash = hash('sha256', Str::uuid()->toString());
            }

            $sig->updated_at = now();
            $sig->save();

            $sigs = LooSignature::query()
                ->where('lo_id', $loId)
                ->whereIn('role_code', ['OM', 'LH'])
                ->get(['role_code', 'signed_at']);

            $signedMap = [];
            foreach ($sigs as $row) {
                $signedMap[(string) $row->role_code] = !empty($row->signed_at);
            }

            $allSigned = (bool) ($signedMap['OM'] ?? false) && (bool) ($signedMap['LH'] ?? false);

            if ($allSigned) {
                if ($loa->loa_status === 'draft') {
                    $loa->loa_status = 'signed_internal';
                }

                $payload = $this->normalizePayload($loa->payload);
                $items = (array) ($payload['items'] ?? []);

                $this->ensurePdfInDb($loa, $payload, $items, $actorStaffId, true);

                $loa->updated_at = now();
                $loa->save();
            }

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

            $payload = $this->normalizePayload($loa->payload);
            $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);

            if ($pdfFileId <= 0) {
                throw new RuntimeException('PDF is not generated yet. Ensure OM & LH have signed.');
            }

            $loa->loa_status = 'sent_to_client';
            $loa->sent_to_client_at = now();
            $loa->updated_at = now();
            $loa->save();

            return $this->attachVirtualItems($loa);
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

            return $loa->refresh();
        }, 3);
    }
}
