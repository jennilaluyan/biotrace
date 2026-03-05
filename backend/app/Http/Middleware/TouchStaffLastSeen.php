<?php

namespace App\Http\Middleware;

use App\Models\Staff;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class TouchStaffLastSeen
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $user = $request->user();
        if (!$user instanceof Staff) {
            return $response;
        }

        if (!Schema::hasColumn('staffs', 'last_seen_at')) {
            return $response;
        }

        // throttle biar DB nggak ditulis tiap request
        $now = now();
        $last = $user->last_seen_at ? Carbon::parse($user->last_seen_at) : null;
        if ($last && $last->greaterThanOrEqualTo($now->copy()->subSeconds(45))) {
            return $response;
        }

        Staff::query()
            ->whereKey($user->getKey())
            ->update(['last_seen_at' => $now]);

        return $response;
    }
}