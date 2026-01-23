<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Carbon\Carbon;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /**
         * Force all Carbon JSON serialization to APP_TIMEZONE (lab timezone).
         * Output: 2026-01-23T08:00:00+08:00 (NOT Z unless your APP_TIMEZONE is UTC).
         *
         * This prevents the classic bug:
         * - user enters 08:00 local
         * - backend returns 08:00Z
         * - frontend shows 16:00 in +08
         */
        Carbon::serializeUsing(function ($date) {
            $tz = config('app.timezone', 'Asia/Makassar');
            return $date->copy()->setTimezone($tz)->format('Y-m-d\TH:i:sP');
        });
    }
}
