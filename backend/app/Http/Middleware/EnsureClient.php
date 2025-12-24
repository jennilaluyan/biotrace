<?php

namespace App\Http\Middleware;

use App\Models\Client;
use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;

class EnsureClient
{
    public function handle(Request $request, Closure $next)
    {
        if (!($request->user() instanceof Client)) {
            return ApiResponse::error('Client authentication required.', 'CLIENT_ONLY', 403, [
                'resource' => 'clients',
            ]);
        }

        return $next($request);
    }
}
