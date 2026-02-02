<?php

namespace App\Services;

use App\Models\LetterOfOrder;
use App\Models\LetterOfOrderItem;
use App\Models\LooSignature;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class LetterOfOrderService
{
    public function __construct(
        private readonly LooNumberGenerator $numberGen,
        private readonly LooPdfService $pdf,
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
     * Force all LoO PDFs to live under storage/app/private/reports/loo/...
     * DB must store a RELATIVE path usable by Storage::disk('local') (root storage/app/private).
     */
    private function forceReportsLooPath(string $pathOrAnything, string $looNumber): string
    {
        $p = str_replace('\\', '/', trim((string) $pathOrAnything));

        // If somehow a full URL got stored, strip it
        if (preg_match('/^https?:\/\//i', $p)) {
            $u = parse_url($p, PHP_URL_PATH);
            if (is_string($u) && $u !== '') $p = $u;
        }

        $p = ltrim($p, '/');

        // Migrate legacy prefix
        if (str_starts_with($p, 'letters/loo/')) {
            $p = preg_replace('#^letters/loo/#', 'reports/loo/', $p);
        }

        // If already correct, keep
        if (str_starts_with($p, 'reports/loo/')) {
            return $p;
        }

        // Fall back to a guaranteed correct path
        $year = now()->format('Y');
        $safe = str_replace(['/', '\\'], '_', trim($looNumber));
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $safe) ?: 'loo';
        return "reports/loo/{$year}/{$safe}.pdf";
    }

    /**
     * Ensure PDF exists on disk for a given LoO, using payload snapshot (safe).
     * Generates even for DRAFT so preview works right after generate.
     */
    private function ensurePdfOnDisk(LetterOfOrder $loa, array $payload, array $itemsSnapshot, bool $forceRegenerate = false): void
    {
        $number = (string) ($loa->number ?? data_get($payload, 'loo_number', data_get($payload, 'loa_number', '')));

        if ($number === '') {
            // must have a number
            $number = $this->numberGen->nextNumber();
            $loa->number = $number;
        }

        // Always enforce correct path location
        $candidate = (string) ($loa->file_url ?? $this->pdf->buildPath($number));
        $path = $this->forceReportsLooPath($candidate, $number);

        // Decide whether to generate
        $alreadyGenerated = !empty($payload['pdf_generated_at']);
        $shouldGenerate = $forceRegenerate || !$alreadyGenerated || !Storage::disk('local')->exists($path);

        if (!$shouldGenerate) {
            // still normalize file_url in DB if needed
            if ((string) $loa->file_url !== $path) {
                $loa->file_url = $path;
            }
            return;
        }

        // Make sure we have signatures loaded for checkbox display
        $loa->loadMissing(['signatures']);

        $binary = $this->pdf->render('documents.surat_pengujian', [
            'loo' => $loa,                 // blade expects $loo->number and $loo->signatures
            'payload' => $payload,
            'client' => null,              // intentionally omitted by design
            'items' => $itemsSnapshot,      // use snapshot, do NOT query broken items table
        ]);

        $this->pdf->store($path, $binary);

        $payload['pdf_generated_at'] = now()->toISOString();
        $loa->payload = $payload;
        $loa->file_url = $path;
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

                $this->ensurePdfOnDisk($existing, $payload, $items, $forceRegenerate);

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
                'pdf_generated_at' => null,
            ];

            try {
                $loa = LetterOfOrder::query()->create([
                    'sample_id' => $anchorSampleId,
                    'number' => $number,
                    'generated_at' => now(),
                    'generated_by' => $actorStaffId,

                    // placeholder (will be normalized after PDF store)
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
             * ✅ Step 4: Promote samples included in LOO
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

            // 7) create signature slots
            $roles = DB::table('loa_signature_roles')
                ->orderBy('sort_order')
                ->get(['role_code']);

            foreach ($roles as $r) {
                LooSignature::query()->create([
                    'lo_id' => (int) $loa->lo_id,
                    'role_code' => $r->role_code,
                    // ...
                ]);
            }

            // ✅ generate PDF immediately so preview works right away
            $loa->loadMissing(['signatures']);
            $this->ensurePdfOnDisk($loa, $payload, $items, true);
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
            $sig->signature_hash = hash('sha256', Str::uuid()->toString());
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

                // Ensure PDF exists (and regen once after both signed, so checkbox markers are correct)
                $items = (array) ($payload['items'] ?? []);
                $this->ensurePdfOnDisk($loa, $payload, $items, true);

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
            if (empty($payload['pdf_generated_at'])) {
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
                $sig->signature_hash = hash('sha256', Str::uuid()->toString());
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