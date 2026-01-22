<?php

namespace App\Http\Middleware;

use App\Models\Client;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

class EnsureClient
{
    public function handle(Request $request, Closure $next)
    {
        // 1) PRIORITAS: Bearer token harus menang (biar tidak ketimpa cookie staff)
        $bearer = $request->bearerToken();
        if ($bearer) {
            $pat = PersonalAccessToken::findToken($bearer);

            if ($pat && $pat->tokenable instanceof Client) {
                /** @var Client $client */
                $client = $pat->tokenable;

                // Paksa request "melihat" user sebagai client
                Auth::shouldUse('client_api');
                Auth::setUser($client);

                $request->setUserResolver(function () use ($client) {
                    return $client;
                });

                return $next($request);
            }
        }

        // 2) FALLBACK: coba guard client_api (kalau kamu memang pakai guard ini)
        Auth::shouldUse('client_api');
        $client = Auth::guard('client_api')->user();

        if ($client instanceof Client) {
            $request->setUserResolver(function () use ($client) {
                return $client;
            });

            return $next($request);
        }

        // 3) Kalau sampai sini, bukan client
        return response()->json([
            'status'  => 403,
            'error'   => 'Forbidden',
            'code'    => 'CLIENT_ONLY',
            'message' => 'Client authentication required.',
            'context' => [
                'method' => $request->method(),
                'path'   => $request->path(),
            ],
        ], 403);
    }
}
