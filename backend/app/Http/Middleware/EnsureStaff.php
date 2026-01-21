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
        // 1) PRIORITAS: Bearer token (biar tidak ketimpa cookie client / sesi lain)
        $bearer = $request->bearerToken();
        if ($bearer) {
            $pat = PersonalAccessToken::findToken($bearer);

            if ($pat && $pat->tokenable instanceof Staff) {
                /** @var Staff $staff */
                $staff = $pat->tokenable;

                Auth::setUser($staff);
                // kalau guard staff kamu namanya beda, ganti di sini
                Auth::shouldUse('staff_api');

                $request->setUserResolver(function () use ($staff) {
                    return $staff;
                });

                return $next($request);
            }
        }

        // 2) FALLBACK: coba guard staff_api (atau guard staff kamu yang sebenarnya)
        $staff = Auth::guard('staff_api')->user();
        if ($staff instanceof Staff) {
            Auth::shouldUse('staff_api');

            $request->setUserResolver(function () use ($staff) {
                return $staff;
            });

            return $next($request);
        }

        return response()->json([
            'status'  => 403,
            'error'   => 'Forbidden',
            'code'    => 'STAFF_ONLY',
            'message' => 'Staff authentication required.',
            'context' => [
                'method' => $request->method(),
                'path'   => $request->path(),
            ],
        ], 403);
    }
}
