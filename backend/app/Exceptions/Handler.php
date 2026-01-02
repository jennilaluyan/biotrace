<?php

namespace App\Exceptions;

use App\Support\ApiResponse;
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
    protected $dontReport = [];

    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    // OVERRIDE report() untuk TIDAK log sama sekali
    public function report(Throwable $e)
    {
        // DO NOTHING - jangan log apapun
        return;
    }

    public function register(): void
    {
        // Kosong
    }

    public function render($request, Throwable $e)
    {
        if ($this->isApi($request)) {
            if ($e instanceof AuthenticationException) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'code' => 'AUTH.UNAUTHENTICATED',
                    'data' => null,
                ], 401);
            }

            if ($e instanceof AuthorizationException) {
                return response()->json([
                    'success' => false,
                    'message' => 'You do not have permission to perform this action.',
                    'code' => 'AUTH.FORBIDDEN',
                    'data' => null,
                ], 403);
            }

            if (
                $e instanceof ModelNotFoundException ||
                ($e instanceof HttpExceptionInterface && $e->getStatusCode() === 404)
            ) {
                return response()->json([
                    'success' => false,
                    'message' => 'Resource not found.',
                    'code' => 'COMMON.NOT_FOUND',
                    'data' => null,
                ], 404);
            }

            if ($e instanceof ValidationException) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation error.',
                    'code' => 'VALIDATION.ERROR',
                    'data' => ['errors' => $e->errors()],
                ], 422);
            }

            if ($e instanceof HttpExceptionInterface) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage() ?: 'HTTP error.',
                    'code' => 'HTTP.' . $e->getStatusCode(),
                    'data' => null,
                ], $e->getStatusCode());
            }

            return response()->json([
                'success' => false,
                'message' => 'Internal server error.',
                'code' => 'SERVER.ERROR',
                'data' => null,
                'debug' => config('app.debug') ? [
                    'exception' => get_class($e),
                    'message' => $e->getMessage(),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                ] : null,
            ], 500);
        }

        return parent::render($request, $e);
    }

    protected function isApi($request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }
}
