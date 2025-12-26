<?php

namespace App\Providers;

use App\Models\Client;
use App\Policies\ClientPolicy;
use App\Models\Sample;
use App\Policies\SamplePolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use App\Models\SampleRequest;
use App\Policies\SampleRequestPolicy;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * The policy mappings for the application.
     *
     * @var array<class-string, class-string>
     */
    protected $policies = [
        Client::class => ClientPolicy::class,
        Sample::class => SamplePolicy::class,
        SampleRequest::class => SampleRequestPolicy::class
    ];

    public function boot(): void
    {
        $this->registerPolicies();
    }
}
