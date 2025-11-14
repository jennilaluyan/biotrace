<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;

class Authenticate extends Middleware
{
    /**
     * Override redirect behavior for unauthenticated API requests.
     * For APIs, we NEVER redirect to a login page.
     */
    protected function redirectTo($request): ?string
    {
        // Jangan redirect ke route('login'), cukup balas 401 JSON
        return null;
    }
}
