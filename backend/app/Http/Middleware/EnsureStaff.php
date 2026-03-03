<?php

namespace App\Http\Middleware;

use App\Models\Staff;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

class EnsureStaff
{
    public function handle(Request $request, Closure $next)
    {
        // 1) Prioritas: Bearer token
        $bearer = $request->bearerToken();
        if ($bearer) {
            $pat = PersonalAccessToken::findToken($bearer);

            if ($pat && $pat->tokenable instanceof Staff) {
                $staff = $pat->tokenable;

                Auth::setUser($staff);
                $request->setUserResolver(fn() => $staff);

                return $next($request);
            }
        }

        // 2) Fallback: user dari auth middleware (auth:sanctum)
        $u = $request->user();
        if ($u instanceof Staff) {
            return $next($request);
        }

        return response()->json([
            'status' => 403,
            'error' => 'Forbidden',
            'code' => 'STAFF_ONLY',
            'message' => 'Staff authentication required.',
            'context' => [
                'method' => $request->method(),
                'path' => $request->path(),
            ],
        ], 403);
    }
}
