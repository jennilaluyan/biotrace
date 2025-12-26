<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\SampleController;
use App\Http\Controllers\SampleCommentController;
use App\Http\Controllers\SampleStatusHistoryController;
use App\Http\Controllers\StaffApprovalController;
use App\Http\Controllers\ClientAuthController;
use App\Http\Controllers\ClientVerificationController;
use App\Http\Controllers\SampleRequestController;
use App\Http\Controllers\SampleRequestIntakeController;
use App\Http\Middleware\EnsureStaff;
use App\Http\Middleware\EnsureClient;


Route::prefix('v1')->group(function () {

    // ===== AUTH STAFF =====
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/register', [AuthController::class, 'register']);

    // ===== AUTH CLIENT =====
    Route::post('/clients/register', [ClientAuthController::class, 'register']);
    Route::post('/clients/login', [ClientAuthController::class, 'login']);

    // ===== STAFF PROTECTED =====
    Route::middleware(['auth:sanctum', EnsureStaff::class])->group(function () {

        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // clients
        Route::get('clients', [ClientController::class, 'index']);
        Route::get('clients/{client}', [ClientController::class, 'show']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::patch('/clients/{client}', [ClientController::class, 'update']);
        Route::put('/clients/{client}', [ClientController::class, 'update']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::get('clients/{client}/samples', [ClientController::class, 'samples']);

        // samples
        Route::get('samples', [SampleController::class, 'index']);
        Route::get('samples/{sample}', [SampleController::class, 'show']);
        Route::post('samples', [SampleController::class, 'store']);
        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus']);
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index']);

        Route::get('samples/{sample}/comments', [SampleCommentController::class, 'index']);
        Route::post('samples/{sample}/comments', [SampleCommentController::class, 'store']);

        // approvals
        Route::get('/staffs/pending', [StaffApprovalController::class, 'pending']);
        Route::post('/staffs/{staff}/approve', [StaffApprovalController::class, 'approve']);
        Route::post('/staffs/{staff}/reject', [StaffApprovalController::class, 'reject']);

        Route::get('/clients/pending', [ClientVerificationController::class, 'pending']);
        Route::post('/clients/{client}/approve', [ClientVerificationController::class, 'approve']);
        Route::post('/clients/{client}/reject', [ClientVerificationController::class, 'reject']);

        // sample requests (staff queue)
        Route::get('/sample-requests', [SampleRequestController::class, 'index']);
        Route::get('/sample-requests/{sampleRequest}', [SampleRequestController::class, 'show']);
        Route::patch('/sample-requests/{sampleRequest}/status', [SampleRequestController::class, 'updateStatus']);
        Route::patch('/sample-requests/{sampleRequest}/handover', [SampleRequestController::class, 'handover']);
        Route::post('/sample-requests/{sampleRequest}/intake', [SampleRequestIntakeController::class, 'store']);
    });

    // ===== CLIENT PROTECTED =====
    Route::middleware('auth:client,client_api')->group(function () {
        Route::get('/clients/me', [ClientAuthController::class, 'me']);
        Route::post('/clients/logout', [ClientAuthController::class, 'logout']);

        // client submit request
        Route::post('/sample-requests', [SampleRequestController::class, 'store']);
        Route::get('/sample-requests', [SampleRequestController::class, 'index']); // my requests
        Route::get('/sample-requests/{sampleRequest}', [SampleRequestController::class, 'show']);
    });
});
