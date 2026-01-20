<?php

namespace App\Services;

use App\Models\LetterOfOrder;
use App\Models\LoaSignature;
use App\Models\LoaSignatureRole;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

class LetterOfOrderService
{
    public function __construct(
        private readonly LoaNumberGenerator $numberGen,
        private readonly LoaPdfService $pdf,
    ) {}

    public function ensureDraftForSample(int $sampleId, int $actorStaffId): LetterOfOrder
    {
        return DB::transaction(function () use ($sampleId, $actorStaffId) {

            $existing = LetterOfOrder::query()->where('sample_id', $sampleId)->first();
            if ($existing) return $existing;

            $number = $this->numberGen->nextNumber();
            $path = $this->pdf->buildPath($number);

            // snapshot minimal (jangan query berat)
            $sample = DB::table('samples')->where('sample_id', $sampleId)->first();
            if (!$sample) throw new RuntimeException('Sample not found.');

            $client = null;
            if (!empty($sample->client_id)) {
                $client = DB::table('clients')->where('client_id', $sample->client_id)->first();
            }

            $payload = [
                'loa_number' => $number,
                'generated_at' => now()->toISOString(),
                'sample_id' => $sample->sample_id,
                'lab_sample_code' => $sample->lab_sample_code ?? null,
                'sample_type' => $sample->sample_type ?? null,
                'client' => $client ? [
                    'name' => $client->name ?? null,
                    'organization' => $client->organization ?? null,
                    'email' => $client->email ?? null,
                    'phone' => $client->phone ?? null,
                ] : null,
            ];

            // render PDF
            $binary = $this->pdf->render('documents.loa.berita_acara', [
                'loa' => (object)['number' => $number],
                'payload' => $payload,
                'sample' => $sample,
                'client' => $client,
            ]);

            $this->pdf->store($path, $binary);

            $loa = LetterOfOrder::query()->create([
                'sample_id' => $sampleId,
                'number' => $number,
                'generated_at' => now(),
                'generated_by' => $actorStaffId,
                'file_url' => $path,
                'loa_status' => 'draft',
                'payload' => $payload,
                'created_at' => now(),
                'updated_at' => null,
            ]);

            // create signature slots from loa_signature_roles
            $roles = DB::table('loa_signature_roles')->orderBy('sort_order')->get(['role_code']);
            foreach ($roles as $r) {
                LoaSignature::query()->create([
                    'lo_id' => $loa->lo_id,
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

            return $loa;
        }, 3);
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
            $om = LoaSignature::query()->where('lo_id', $loId)->where('role_code', 'OM')->whereNotNull('signed_at')->exists();
            $lh = LoaSignature::query()->where('lo_id', $loId)->where('role_code', 'LH')->whereNotNull('signed_at')->exists();

            if ($om && $lh && $loa->loa_status === 'draft') {
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
