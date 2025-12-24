<?php

namespace App\Http\Middleware;

use App\Models\Staff;
use App\Support\ApiResponse;
use Closure;
use Illuminate\Http\Request;

class EnsureStaff
{
    public function handle(Request $request, Closure $next)
    {
        if (!($request->user() instanceof Staff)) {
            return ApiResponse::error('Staff authentication required.', 'STAFF_ONLY', 403, [
                'resource' => 'auth',
            ]);
        }

        return $next($request);
    }
}
