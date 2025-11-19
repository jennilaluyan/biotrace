<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

/*
|--------------------------------------------------------------------------
| API Debug Route (sementara, untuk cek session & guard)
|--------------------------------------------------------------------------
|
| Endpoint ini tanpa middleware auth, cuma untuk melihat:
| - session kebaca atau tidak
| - guard web/api melihat user atau tidak
| - $request->user() isinya apa
|
| Akses pakai browser: https://lims.localhost/api/v1/debug/session
|
*/

Route::get('/v1/debug/session', function (Request $request) {
    $webUser     = Auth::guard('web')->user();
    $apiUser     = Auth::guard('api')->user();
    $requestUser = $request->user();

    return response()->json([
        'has_session'        => $request->hasSession(),
        'session_id'         => $request->hasSession() ? $request->session()->getId() : null,
        'session_all_keys'   => $request->hasSession() ? array_keys($request->session()->all()) : null,

        'auth_web_check'     => Auth::guard('web')->check(),
        'auth_web_user'      => $webUser
            ? [
                'id'    => $webUser->getKey(),
                'email' => $webUser->email ?? null,
            ]
            : null,

        'auth_api_check'     => Auth::guard('api')->check(),
        'auth_api_user'      => $apiUser
            ? [
                'id'    => $apiUser->getKey(),
                'email' => $apiUser->email ?? null,
            ]
            : null,

        'request_user'       => $requestUser
            ? [
                'id'    => $requestUser->getKey(),
                'email' => $requestUser->email ?? null,
            ]
            : null,
    ]);
});

/*
|--------------------------------------------------------------------------
| API v1 Routes
|--------------------------------------------------------------------------
|
| Di bawah ini baru route “beneran” untuk auth:
| - /auth/login  (tanpa auth)
| - /auth/me     (butuh auth:web,api)
| - /auth/logout (butuh auth:web,api)
|
*/

Route::prefix('v1')->group(function () {

    // Login: cookie-session (SPA) + optional token (Postman)
    Route::post('/auth/login', [AuthController::class, 'login']);

    // TERIMA session (guard web) ATAU token Sanctum (guard api)
    Route::middleware('auth:web,api')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
    });
});
