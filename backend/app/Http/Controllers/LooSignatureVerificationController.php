<?php

namespace App\Http\Controllers;

use App\Models\LoaSignature;
use Illuminate\Http\JsonResponse;

class LooSignatureVerificationController extends Controller
{
    /**
     * GET /v1/loo/signatures/verify/{hash}
     *
     * This is meant to be an audit-friendly endpoint for QR codes embedded in LOO PDF.
     * Protected by auth:sanctum (internal staff).
     */
    public function show(string $hash): JsonResponse
    {
        $hash = trim($hash);

        /** @var LoaSignature|null $sig */
        $sig = LoaSignature::query()
            ->where('signature_hash', $hash)
            ->with([
                'letter',       // LetterOfOrder
                'staffSigner',  // Staff (optional)
            ])
            ->first();

        if (!$sig) {
            return response()->json([
                'message' => 'Signature not found.',
                'code' => 'SIGNATURE_NOT_FOUND',
            ], 404);
        }

        $letter = $sig->letter;

        return response()->json([
            'data' => [
                'signature_hash' => (string) $sig->signature_hash,
                'role_code' => (string) $sig->role_code,
                'signed_at' => $sig->signed_at?->toIso8601String(),
                'signed_by_staff' => $sig->signed_by_staff,
                'signed_by_client' => $sig->signed_by_client,

                'lo_id' => $sig->lo_id,
                'loo_number' => $letter?->number,
                'loo_status' => $letter?->loa_status,

                'signer' => $sig->staffSigner ? [
                    'staff_id' => $sig->staffSigner->staff_id ?? null,
                    'name' => $sig->staffSigner->full_name ?? ($sig->staffSigner->name ?? null),
                    'email' => $sig->staffSigner->email ?? null,
                ] : null,
            ],
        ]);
    }
}
