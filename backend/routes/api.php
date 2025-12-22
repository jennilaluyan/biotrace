<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\SampleController;
use App\Http\Controllers\SampleCommentController;
use App\Http\Controllers\SampleStatusHistoryController;

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

        'auth_web_user'      => $webUser
            ? [
                'id'    => $webUser->getAuthIdentifier(),
                'email' => $webUser->email ?? null,
            ]
            : null,

        'auth_api_user'      => $apiUser
            ? [
                'id'    => $apiUser->getAuthIdentifier(),
                'email' => $apiUser->email ?? null,
            ]
            : null,

        'request_user'       => $requestUser
            ? [
                'id'    => $requestUser->getAuthIdentifier(),
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

        /*
        |--------------------------------------------------------------------------
        | Clients Routes
        |--------------------------------------------------------------------------
        |
        | Frontend (clientService) mengakses:
        | - GET  /api/v1/clients
        | - GET  /api/v1/clients/{client}
        | - POST /api/v1/clients
        |
        */

        Route::get('clients', [ClientController::class, 'index']);
        Route::get('clients/{client}', [ClientController::class, 'show']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::patch('/clients/{client}', [ClientController::class, 'update']);
        Route::put('/clients/{client}', [ClientController::class, 'update']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::get('clients/{client}/samples', [ClientController::class, 'samples']);

        Route::get('samples', [SampleController::class, 'index']);
        Route::get('samples/{sample}', [SampleController::class, 'show']);
        Route::post('samples', [SampleController::class, 'store']);
        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus']);
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index']);

        Route::get('samples/{sample}/comments', [SampleCommentController::class, 'index']);
        Route::post('samples/{sample}/comments', [SampleCommentController::class, 'store']);
    });
});