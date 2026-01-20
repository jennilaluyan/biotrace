<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Services\LetterOfOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ClientLoaController extends Controller
{
    public function __construct(private readonly LetterOfOrderService $svc) {}

    public function sign(int $loaId): JsonResponse
    {
        /** @var Client $client */
        $client = Auth::user();
        if (!$client instanceof Client) {
            return response()->json(['message' => 'Authenticated client not found.'], 500);
        }

        $loa = $this->svc->clientSign($loaId, (int) $client->client_id);

        return response()->json([
            'message' => 'Client signed. LoA locked.',
            'data' => $loa,
        ]);
    }
}
