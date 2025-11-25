<?php

namespace App\Exceptions;

use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontReport = [
        //
    ];

    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function register(): void
    {
        // sementara kosong, kita handle semuanya di render()
    }

    public function render($request, Throwable $e)
    {
        if ($this->isApi($request)) {
            // 401 - belum login / token invalid
            if ($e instanceof AuthenticationException) {
                // delegasi ke unauthenticated() supaya audit log tetap jalan
                return $this->unauthenticated($request, $e);
            }

            // 403 - sudah login tapi tidak punya hak akses (policy / gate)
            if ($e instanceof AuthorizationException) {
                return ApiResponse::error(
                    message: 'You do not have permission to perform this action.',
                    code: 'AUTH.FORBIDDEN',
                    status: 403,
                    options: [
                        'resource' => $this->guessResourceFromPath($request),
                    ],
                );
            }

            // 404 - resource tidak ditemukan (model binding ATAU HTTP 404)
            if (
                $e instanceof ModelNotFoundException ||
                ($e instanceof HttpExceptionInterface && $e->getStatusCode() === 404)
            ) {
                return ApiResponse::error(
                    message: 'Resource not found.',
                    code: 'COMMON.NOT_FOUND',
                    status: 404,
                    options: [
                        'resource' => $this->guessResourceFromPath($request),
                        'debug'    => [
                            'branch' => '404_BRANCH',
                            'path'   => $request->path(),
                            'class'  => get_class($e),
                            'status' => method_exists($e, 'getStatusCode') ? $e->getStatusCode() : null,
                        ],
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
                        'resource' => $this->guessResourceFromPath($request),
                        'details'  => [
                            'errors' => $e->errors(),
                        ],
                    ],
                );
            }

            // Fallback semua HTTP error lain (405, 500, dll)
            if ($e instanceof HttpExceptionInterface) {
                $status  = $e->getStatusCode();
                $message = $e->getMessage() ?: 'HTTP error.';

                // selain 404, biarkan pakai kode HTTP.xxx
                return ApiResponse::error(
                    message: $message,
                    code: 'HTTP.' . $status,
                    status: $status,
                    options: [
                        'resource' => $this->guessResourceFromPath($request),
                        'debug'    => [
                            'branch' => 'HTTP_FALLBACK_BRANCH',
                            'path'   => $request->path(),
                            'class'  => get_class($e),
                            'status' => $status,
                        ],
                    ],
                );
            }


            // Kalau bukan tipe yang di atas, anggap 500
            return ApiResponse::error(
                message: 'Internal server error.',
                code: 'SERVER.ERROR',
                status: 500,
                options: [
                    'resource' => $this->guessResourceFromPath($request),
                    'debug'    => [
                        'exception' => get_class($e),
                        'message'   => $e->getMessage(),
                    ],
                ],
            );
        }

        return parent::render($request, $e);
    }

    protected function isApi($request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }

    protected function guessResourceFromPath(Request $request): string
    {
        $path = trim($request->path(), '/'); // contoh: "api/v1/clients/3" atau "v1/clients/3"

        // longgar saja: selama mengandung kata "clients", anggap resource-nya clients
        if (strpos($path, 'clients') !== false) {
            return 'clients';
        }

        if (strpos($path, 'samples') !== false) {
            return 'samples';
        }

        if (strpos($path, 'auth') !== false) {
            return 'auth';
        }

        return 'api';
    }

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

        return parent::unauthenticated($request, $exception);
    }
}
