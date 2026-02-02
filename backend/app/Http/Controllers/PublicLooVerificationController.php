<?php

namespace App\Http\Controllers;

use App\Models\LooSignature;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PublicLooVerificationController extends Controller
{
    /**
     * GET /api/v1/verify/loo/{hash}
     * Public verification endpoint for QR embedded in LOO PDFs.
     *
     * Must work WITHOUT auth token (scanner-friendly).
     */
    public function verify(Request $request, string $hash): View
    {
        $hash = trim($hash);

        /** @var LooSignature|null $sig */
        $sig = LooSignature::query()
            ->where('signature_hash', $hash)
            ->with([
                'letter',      // LetterOfOrder
                'staffSigner', // Staff (optional)
            ])
            ->first();

        // Render a simple public page (valid / invalid)
        if (!$sig) {
            return view('verify.loo', [
                'valid' => false,
                'hash' => $hash,
                'sig' => null,
                'letter' => null,
                'signer' => null,
            ]);
        }

        $letter = $sig->letter;

        return view('verify.loo', [
            'valid' => true,
            'hash' => (string) $sig->signature_hash,
            'sig' => $sig,
            'letter' => $letter,
            'signer' => $sig->staffSigner,
        ]);
    }
}