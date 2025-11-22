<?php

namespace App\Exceptions;

use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * Exceptions yang tidak perlu di-report.
     */
    protected $dontReport = [
        //
    ];

    /**
     * Input yang tidak boleh ikut di-flash saat validation error.
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register callback pelengkap (kalau mau report dsb).
     */
    public function register(): void
    {
        // sementara kosong, kita handle semuanya di render()
    }

    /**
     * Render semua exception.
     *
     * Untuk route API (api/*), kita bungkus dengan ApiResponse::error().
     */
    public function render($request, Throwable $e)
    {
        if ($this->isApi($request)) {
            // 401 - belum login / token invalid
            if ($e instanceof AuthenticationException) {
                return ApiResponse::error(
                    message: 'Unauthenticated.',
                    code: 'AUTH.UNAUTHENTICATED',
                    status: 401,
                    options: [
                        'resource' => 'auth',
                    ],
                );
            }

            // 403 - sudah login tapi tidak punya hak akses (policy / gate)
            if ($e instanceof AuthorizationException) {
                return ApiResponse::error(
                    message: 'You do not have permission to perform this action.',
                    code: 'AUTH.FORBIDDEN',
                    status: 403,
                    options: [
                        'resource' => 'clients',
                    ],
                );
            }

            // 404 - model binding gagal / data tidak ditemukan
            if ($e instanceof ModelNotFoundException) {
                return ApiResponse::error(
                    message: 'Resource not found.',
                    code: 'COMMON.NOT_FOUND',
                    status: 404,
                    options: [
                        'resource' => 'clients',
                    ],
                );
            }

            // 422 - validasi gagal
            if ($e instanceof ValidationException) {
                return ApiResponse::error(
                    message: 'Validation error.',
                    code: 'VALIDATION.ERROR',
                    status: 422,
                    options: [
                        'resource' => 'clients',
                        'details'  => $e->errors(),
                    ],
                );
            }

            // Fallback semua HTTP error lain (405, 500, dll) yang udah di-wrap jadi HttpExceptionInterface
            if ($e instanceof HttpExceptionInterface) {
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
            }

            // Kalau bukan tipe yang di atas, anggap 500
            return ApiResponse::error(
                message: 'Internal server error.',
                code: 'SERVER.ERROR',
                status: 500,
                options: [
                    'resource' => 'api',
                    'debug'    => [
                        'exception' => get_class($e),
                        'message'   => $e->getMessage(),
                    ],
                ],
            );
        }

        // Non-API tetap pakai behaviour bawaan Laravel
        return parent::render($request, $e);
    }

    /**
     * Deteksi apakah request ini request API (bukan web).
     */
    protected function isApi($request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }

    /**
     * Override bawaan Laravel: JANGAN redirect ke route('login').
     * Untuk semua request, log dulu lalu balas JSON 401.
     */
    protected function unauthenticated($request, AuthenticationException $exception)
    {
        $user = $request->user();

        AuditLogger::write(
            'AUTH_401_UNAUTHENTICATED',
            $user?->staff_id,
            'auth',
            null,
            null,
            [
                'url'    => $request->fullUrl(),
                'guards' => $exception->guards(),
            ]
        );

        // Untuk API, biar konsisten pakai ApiResponse juga
        if ($this->isApi($request)) {
            return ApiResponse::error(
                message: 'Unauthenticated.',
                code: 'AUTH.UNAUTHENTICATED',
                status: 401,
                options: [
                    'resource' => 'auth',
                ],
            );
        }

        // fallback web (kalau suatu saat ada web route)
        return parent::unauthenticated($request, $exception);
    }
}
