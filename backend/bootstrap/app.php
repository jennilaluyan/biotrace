<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Illuminate\Auth\AuthenticationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Global CORS (aman, bawaan Laravel)
        $middleware->use([
            HandleCors::class,
        ]);

        // Sanctum cookie-mode untuk grup API
        $middleware->appendToGroup('api', EnsureFrontendRequestsAreStateful::class);

        $middleware->alias([
            'auth' => \App\Http\Middleware\Authenticate::class,
        ]);

        // GANTI DENGAN BLOK INI
        $middleware->redirectGuestsTo(function ($request) {
            if ($request->expectsJson()) {
                return null;
            }
            // Jika Anda juga punya rute login web, Anda bisa menambahkannya di sini
            // return route('login');
        });
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->renderable(function (AuthenticationException $e, $request) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })
    ->create();
