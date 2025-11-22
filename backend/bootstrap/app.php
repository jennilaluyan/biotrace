<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Illuminate\Auth\AuthenticationException;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;


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

        $middleware->redirectGuestsTo(function ($request) {
            if ($request->expectsJson()) {
                return null;
            }
        });
    })
    ->withExceptions(function (Exceptions $exceptions) {

        // Pastikan semua request API selalu di-render sebagai JSON
        $exceptions->shouldRenderJsonWhen(function (Request $request, Throwable $e) {
            if ($request->is('api/*')) {
                return true;
            }

            return $request->expectsJson();
        });

        // 401 - belum login / token invalid
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            // Audit log auth 401 (versi ringan; kalau mau sama persis kayak Handler lama, bisa ditambah)
            AuditLogger::write(
                'AUTH_401_UNAUTHENTICATED',
                $request->user()?->staff_id,
                'auth',
                null,
                null,
                [
                    'url'    => $request->fullUrl(),
                    'guards' => $e->guards(),
                ]
            );

            return ApiResponse::error(
                message: 'Unauthenticated.',
                code: 'AUTH.UNAUTHENTICATED',
                status: 401,
                options: [
                    'resource' => 'auth',
                ],
            );
        });

        // 403 - sudah login tapi tidak punya hak akses (policy / gate)
        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null; // biarkan default untuk non-API
            }

            return ApiResponse::error(
                message: 'You do not have permission to perform this action.',
                code: 'AUTH.FORBIDDEN',
                status: 403,
                options: [
                    'resource' => 'clients',
                ],
            );
        });

        // Beberapa 403 di Laravel muncul sebagai AccessDeniedHttpException,
        // tapi itu implement HttpExceptionInterface, jadi akan kena fallback di bawah.

        // 404 - model binding gagal / data tidak ditemukan
        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return ApiResponse::error(
                message: 'Resource not found.',
                code: 'COMMON.NOT_FOUND',
                status: 404,
                options: [
                    'resource' => 'clients',
                ],
            );
        });

        // 422 - validasi gagal
        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return ApiResponse::error(
                message: 'Validation error.',
                code: 'VALIDATION.ERROR',
                status: 422,
                options: [
                    'resource' => 'clients',
                    'details'  => $e->errors(),
                ],
            );
        });

        // Fallback untuk HTTP error lain (405, 500, AccessDeniedHttpException, dsb)
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $status  = $e->getStatusCode();
            $message = $e->getMessage() ?: 'HTTP error.';

            return ApiResponse::error(
                message: $message,
                code: 'HTTP.' . $status,
                status: $status,
                options: [
                    'resource' => 'api',
                ],
            );
        });
    })->create();
