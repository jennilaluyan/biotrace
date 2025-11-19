<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\Request as RequestFacade;

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

    public function register(): void
    {
        //
    }

    /**
     * Override bawaan Laravel: JANGAN redirect ke route('login').
     * Untuk semua request (web & API), balas JSON 401 saja.
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

        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
