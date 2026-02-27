<?php

namespace App\Providers;

use App\Models\Client;
use App\Policies\ClientPolicy;
use App\Models\Sample;
use App\Policies\SamplePolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;
use App\Models\ReagentCalcRule;
use App\Policies\ReagentCalcRulePolicy;

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
        \App\Models\Parameter::class => \App\Policies\ParameterPolicy::class,
        \App\Models\ParameterRequest::class => \App\Policies\ParameterRequestPolicy::class,
        \App\Models\Method::class    => \App\Policies\MethodPolicy::class,
        \App\Models\Reagent::class   => \App\Policies\ReagentPolicy::class,
        \App\Models\SampleTest::class => \App\Policies\SampleTestPolicy::class,
        ReagentCalcRule::class => ReagentCalcRulePolicy::class,
        \App\Models\AuditLog::class => \App\Policies\AuditLogPolicy::class,
    ];

    public function boot(): void
    {
        // Di Laravel 10/11 cukup begini; base class akan handle registrasi.
        // Kalau kamu mau pakai Gate manual, taruh di sini.
    }
}