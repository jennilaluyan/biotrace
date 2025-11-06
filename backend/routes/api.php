<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

Route::prefix('v1/auth')->group(function () {
    Route::post('/login',  [AuthController::class, 'login']);     // public
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me',     [AuthController::class, 'me']);     // protected
        Route::post('/logout', [AuthController::class, 'logout']); // protected
    });
});
