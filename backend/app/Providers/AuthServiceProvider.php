<?php

namespace App\Providers;

use App\Models\Client;
use App\Policies\ClientPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        Client::class => ClientPolicy::class,
        // nanti tambahkan policy lain di sini
    ];

    public function boot(): void
    {
        // Di Laravel 10/11 cukup begini; base class akan handle registrasi.
        // Kalau kamu mau pakai Gate manual, taruh di sini.
    }
}
