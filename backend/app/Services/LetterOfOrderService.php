<?php

namespace App\Services;

use App\Models\LetterOfOrder;
use App\Models\LetterOfOrderItem;
use App\Models\LoaSignature;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

                // If draft/signed_internal/sent_to_client: keep number + file_url,
                // but refresh payload sample_ids/items so UI matches the latest selection.
                $payload = is_array($existing->payload) ? $existing->payload : (array) $existing->payload;

                // Keep existing number for consistency
                $number = (string) ($existing->number ?? '');
                if ($number === '') {
                    $number = $this->numberGen->nextNumber();
                    $existing->number = $number;
                }

                // Ensure file_url exists (db constraint)
                if (empty($existing->file_url)) {
                    $existing->file_url = $this->pdf->buildPath($number);
                }

                $payload['loo_number'] = $number;
                $payload['loa_number'] = $number;
                $payload['sample_ids'] = $sampleIds;
                $payload['items'] = $items;

                // Do NOT reset pdf_generated_at if already generated
                $payload['pdf_generated_at'] = $payload['pdf_generated_at'] ?? null;

                $existing->payload = $payload;
                $existing->updated_at = now();
                $existing->save();

                $existing->loadMissing(['signatures']);
                $existing->setRelation('items', $this->buildItemsModels((int) $existing->lo_id, $items));

                return $existing;
            }

            // 5) create new draft (only if none exists)
            $number = $this->numberGen->nextNumber();
            $reservedPath = $this->pdf->buildPath($number);

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

                    // must not be null
                    'file_url' => $reservedPath,

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

            // 7) create signature slots
            $roles = DB::table('loa_signature_roles')
                ->orderBy('sort_order')
                ->get(['role_code']);

            foreach ($roles as $r) {
                LoaSignature::query()->create([
                    'lo_id' => (int) $loa->lo_id,
                    'role_code' => $r->role_code,
                    'signed_by_staff' => null,
                    'signed_by_client' => null,
                    'signed_at' => null,
                    'signature_hash' => null,
                    'note' => null,
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            }

            // attach relations safely (avoid querying broken items table)
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

            $sig = LoaSignature::query()
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
            $sigs = LoaSignature::query()
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
                $alreadyGenerated = !empty($payload['pdf_generated_at']);

                if (!$alreadyGenerated) {
                    $number = (string) $loa->number;

                    $path = (string) ($loa->file_url ?? $this->pdf->buildPath($number));

                    // DO NOT read $loa->items (avoid DB items table). Use payload snapshot instead.
                    $items = (array) ($payload['items'] ?? []);

                    $binary = $this->pdf->render('documents.loo.surat_perintah_pengujian_sampel', [
                        'loo' => (object) ['number' => $number],
                        'payload' => $payload,
                        'client' => null,
                        'items' => $items,
                        'omUrl' => 'https://google.com',
                        'lhUrl' => 'https://google.com',
                    ]);

                    $this->pdf->store($path, $binary);

                    $payload['pdf_generated_at'] = now()->toISOString();
                    $loa->payload = $payload;
                    $loa->file_url = $path;
                }

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

            $sig = LoaSignature::query()
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
