<?php

namespace App\Services;

use App\Models\LetterOfOrder;
use App\Models\LoaSignature;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class LetterOfOrderService
{
    public function __construct(
        private readonly LooNumberGenerator $numberGen,
        private readonly LooPdfService $pdf,
    ) {}

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

            // 2) enforce same client_id
            $clientIds = $samples->pluck('client_id')->filter()->unique()->values();
            if ($clientIds->count() !== 1) {
                throw new RuntimeException('Selected samples must belong to the same client.');
            }
            $clientId = (int) $clientIds->first();

            // 3) verification + lab code gate
            foreach ($samples as $s) {
                $sid = (int) $s->sample_id;

                if (empty($s->verified_at)) {
                    throw new RuntimeException("Sample {$sid} is not verified yet.");
                }
                if (empty($s->lab_sample_code)) {
                    throw new RuntimeException("Sample {$sid} has no lab_sample_code yet.");
                }
            }

            $client = DB::table('clients')->where('client_id', $clientId)->first();

            // 4) load parameters from request pivot
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

            // 5) build items snapshot (for PDF + DB items table)
            $items = [];
            $sortedSamples = $samples->sortBy(function ($s) {
                return (string) ($s->lab_sample_code ?? '');
            })->values();

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

            // 6) generate number + pdf
            $number = $this->numberGen->nextNumber();
            $path = $this->pdf->buildPath($number);

            $payload = [
                // ✅ primary naming (LoO)
                'loo_number' => $number,

                // ✅ backward compat (kalau ada tempat lain masih baca loa_number)
                'loa_number' => $number,

                'generated_at' => now()->toISOString(),

                'client' => $client ? [
                    'name' => $client->name ?? null,
                    'organization' => $client->organization ?? null,
                    'email' => $client->email ?? null,
                    'phone' => $client->phone ?? null,
                ] : [
                    'name' => null,
                    'organization' => null,
                    'email' => null,
                    'phone' => null,
                ],

                'sample_ids' => $sampleIds,
                'items' => $items,
            ];

            $binary = $this->pdf->render('documents.loo.surat_perintah_pengujian_sampel', [
                'loo' => (object) ['number' => $number],
                'payload' => $payload,
                'client' => $client,
                'items' => $items,
            ]);

            $this->pdf->store($path, $binary);

            // NOTE: keep sample_id filled (use first as anchor) to avoid schema change now
            $loa = LetterOfOrder::query()->create([
                'sample_id' => (int) $sortedSamples->first()->sample_id,
                'number' => $number,
                'generated_at' => now(),
                'generated_by' => $actorStaffId,
                'file_url' => $path,

                // ⚠️ tetap pakai loa_status kalau schema kamu memang begitu sekarang
                'loa_status' => 'draft',

                'payload' => $payload,
                'created_at' => now(),
                'updated_at' => null,
            ]);

            // 7) persist items (NEW TABLE)
            foreach ($items as $it) {
                \App\Models\LetterOfOrderItem::query()->create([
                    'lo_id' => (int) $loa->lo_id,
                    'sample_id' => (int) $it['sample_id'],
                    'lab_sample_code' => (string) $it['lab_sample_code'],
                    'parameters' => $it['parameters'],
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            }

            // 8) create signature slots
            // ⚠️ table masih loa_signature_roles (biar ga ganggu migrasi sekarang)
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

            return $loa->loadMissing(['items', 'signatures']);
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

            if ($sig->signed_at) return $loa; // idempotent

            $sig->signed_by_staff = $actorStaffId;
            $sig->signed_at = now();
            $sig->signature_hash = hash('sha256', Str::uuid()->toString());
            $sig->updated_at = now();
            $sig->save();

            // If both OM & LH signed => signed_internal
            if (in_array($roleCode, ['OM', 'LH'], true) && $loa->loa_status === 'draft') {
                $loa->loa_status = 'signed_internal';
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

            $loa->loa_status = 'sent_to_client';
            $loa->sent_to_client_at = now();
            $loa->updated_at = now();
            $loa->save();

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

            // auto lock after client signed
            $loa->loa_status = 'locked';
            $loa->client_signed_at = now();
            $loa->locked_at = now();
            $loa->updated_at = now();
            $loa->save();

            return $loa->refresh();
        }, 3);
    }
}
