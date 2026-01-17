<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\SampleController;
use App\Http\Controllers\SampleCommentController;
use App\Http\Controllers\SampleStatusHistoryController;
use App\Http\Controllers\StaffApprovalController;
use App\Http\Controllers\StaffRegistrationController;
use App\Http\Controllers\ClientAuthController;
use App\Http\Controllers\ClientVerificationController;
use App\Http\Controllers\ParameterController;
use App\Http\Controllers\MethodController;
use App\Http\Controllers\ReagentController;
use App\Http\Controllers\SampleTestBulkController;
use App\Http\Controllers\SampleTestStatusController;
use App\Http\Controllers\SampleTestDecisionController;
use App\Http\Controllers\TestResultController;
use App\Http\Controllers\ReagentCalculationController;
use App\Http\Controllers\UnitController;
use App\Http\Controllers\SampleTestController;
use App\Http\Controllers\QcControlController;
use App\Http\Controllers\QcRunController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReportSignatureController;
use App\Http\Controllers\CoaPdfController;
use App\Http\Controllers\PublicCoaVerificationController;
use App\Http\Controllers\SampleRequestStatusController;
use App\Http\Controllers\SampleRequestQueueController;

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
    return response()->json([
        'authorization_header' => $request->header('authorization'),
        'bearer_token'         => $request->bearerToken(),
        'has_session'          => $request->hasSession(),
        'auth_web'             => Auth::guard('web')->user()?->email,
        'auth_sanctum'         => Auth::guard('sanctum')->user()?->email,
        'request_user'         => $request->user()?->email,
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
    Route::post('/auth/register', [AuthController::class, 'register']);

    Route::post('/clients/register', [ClientAuthController::class, 'register']);
    Route::post('/clients/login', [ClientAuthController::class, 'login']);
    Route::get('/clients/me', [ClientAuthController::class, 'me']);
    Route::post('/clients/logout', [ClientAuthController::class, 'logout']);

    Route::post('/staffs/register', [StaffRegistrationController::class, 'register']);

    // TERIMA session (guard web) ATAU token Sanctum (guard api)
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        Route::get('/parameters', [ParameterController::class, 'index']);
        Route::post('/parameters', [ParameterController::class, 'store']);
        Route::patch('/parameters/{parameter}', [ParameterController::class, 'update']);
        Route::delete('/parameters/{parameter}', [ParameterController::class, 'destroy']);

        Route::get('/methods', [MethodController::class, 'index']);
        Route::post('/methods', [MethodController::class, 'store']);
        Route::patch('/methods/{method}', [MethodController::class, 'update']);
        Route::delete('/methods/{method}', [MethodController::class, 'destroy']);

        Route::get('/reagents', [ReagentController::class, 'index']);

        Route::get('clients', [ClientController::class, 'index']);
        Route::get('clients/{client}', [ClientController::class, 'show']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::patch('/clients/{client}', [ClientController::class, 'update']);
        Route::put('/clients/{client}', [ClientController::class, 'update']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::get('clients/{client}/samples', [ClientController::class, 'samples']);

        Route::get('samples', [SampleController::class, 'index']);
        Route::post('samples', [SampleController::class, 'store']);
        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus']);
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index']);

        Route::get('samples/{sample}/comments', [SampleCommentController::class, 'index']);
        Route::post('samples/{sample}/comments', [SampleCommentController::class, 'store']);

        Route::get('/staffs/pending', [StaffApprovalController::class, 'pending']);
        Route::post('/staffs/{staff}/approve', [StaffApprovalController::class, 'approve']);
        Route::post('/staffs/{staff}/reject', [StaffApprovalController::class, 'reject']);

        Route::get('/clients/pending', [ClientVerificationController::class, 'pending']);
        Route::post('/clients/{client}/approve', [ClientVerificationController::class, 'approve']);
        Route::post('/clients/{client}/reject', [ClientVerificationController::class, 'reject']);

        Route::get('/debug/policy/sample-test', function (Request $request) {
            $user = $request->user();

            return response()->json([
                'user' => [
                    'id'   => $user?->getAuthIdentifier(),
                    'email' => $user?->email ?? null,
                    'role' => $user?->role?->name ?? null,
                ],
                'abilities' => [
                    'bulk_create' => $user ? $user->can('bulkCreate', [\App\Models\SampleTest::class, \App\Models\Sample::query()->first()]) : false,
                    'decide_om'   => $user ? $user->can('decideAsOM', new \App\Models\SampleTest) : false,
                    'decide_lh'   => $user ? $user->can('decideAsLH', new \App\Models\SampleTest) : false,
                    'analyst_update_status' => $user ? $user->can('updateStatusAsAnalyst', new \App\Models\SampleTest) : false,
                ],
            ]);
        });

        Route::post('samples/{sample}/sample-tests/bulk', [SampleTestBulkController::class, 'store']);

        Route::post('/sample-tests/{sampleTest}/status', [SampleTestStatusController::class, 'update']);

        Route::post('sample-tests/{sampleTest}/om/decision', [SampleTestDecisionController::class, 'omDecision']);
        Route::post('sample-tests/{sampleTest}/lh/decision', [SampleTestDecisionController::class, 'lhDecision']);
        Route::post('sample-tests/{sampleTest}/verify', [SampleTestDecisionController::class, 'verifyAsOM']);
        Route::post('sample-tests/{sampleTest}/validate', [SampleTestDecisionController::class, 'validateAsLH']);

        Route::post('/sample-tests/{sampleTest}/results', [TestResultController::class, 'store']);
        Route::patch('/test-results/{testResult}', [TestResultController::class, 'update']);

        Route::get('/samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'showBySample']);
        Route::post('/reagent-calculations/{calc}/request-approval', [ReagentCalculationController::class, 'requestApproval']);
        Route::post('/reagent-calculations/{calc}/approve', [ReagentCalculationController::class, 'approve']);
        Route::patch('/reagent-calculations/{calc}', [ReagentCalculationController::class, 'update']);
        Route::get('/samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'show']);
        Route::patch('/samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'update']);
        Route::post('/samples/{sample}/reagent-calculation/om-approve', [ReagentCalculationController::class, 'omApprove']);

        Route::get('units', [UnitController::class, 'index']);
        Route::get('samples/{sample}/sample-tests', [SampleTestController::class, 'indexBySample']);

        Route::get('qc-controls', [QcControlController::class, 'index']);
        Route::get('samples/{sample}/qc-controls', [QcControlController::class, 'forSample']);

        Route::post('samples/{sample}/qc-runs', [QcRunController::class, 'store']);
        Route::get('samples/{sample}/qc-summary', [QcRunController::class, 'summary']);

        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/audit-logs/export', [AuditLogController::class, 'exportCsv']);
        Route::get('/audit-logs/export/pdf', [AuditLogController::class, 'exportPdf']);

        // =========================
        // REPORTS 
        // =========================

        // Generate report by sample
        Route::post('/samples/{sample}/reports', [ReportController::class, 'store'])
            ->whereNumber('sample');

        // List reports
        Route::get('/reports', [ReportController::class, 'index']);

        // Report detail
        Route::get('/reports/{report}', [ReportController::class, 'show'])
            ->whereNumber('report');

        // Sign report
        Route::post('/reports/{report}/sign', [ReportSignatureController::class, 'sign'])
            ->whereNumber('report');

        // Finalize report
        Route::post('/reports/{report}/finalize', [ReportController::class, 'finalize'])
            ->whereNumber('report');

        // Download COA PDF
        Route::get('/reports/{report}/pdf', [CoaPdfController::class, 'downloadByReport'])
            ->whereNumber('report');

        Route::get('/samples/{sample}/coa', [CoaPdfController::class, 'downloadBySample'])
            ->whereNumber('sample');


        // =========================
        // SAMPLES (static route first + numeric binding)
        // =========================

        // ✅ static route MUST be before dynamic {sample}
        Route::get('samples/requests', [SampleRequestQueueController::class, 'index']);

        // ✅ IMPORTANT: request-status endpoint (yang dipakai SampleRequestStatusApiTest)
        Route::post('samples/{sample}/request-status', [SampleRequestStatusController::class, 'update'])
            ->whereNumber('sample');

        // Sample detail
        Route::get('samples/{sample}', [SampleController::class, 'show'])
            ->whereNumber('sample');

        // Create sample
        Route::post('samples', [SampleController::class, 'store']);

        // Update sample status (lab workflow)
        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus'])
            ->whereNumber('sample');

        // Status history
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index'])
            ->whereNumber('sample');
    });

    Route::get('/verify/coa/{hash}', [
        PublicCoaVerificationController::class,
        'verify'
    ]);
});
