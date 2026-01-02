<?php

namespace App\Providers;

use App\Logging\NullLogManager;
use Illuminate\Support\ServiceProvider;

class CustomLogServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->singleton('log', function () {
            return new NullLogManager();
        });
    }
}
