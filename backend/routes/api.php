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
use App\Http\Controllers\ClientSampleRequestController;
use App\Http\Controllers\SampleIntakeChecklistController;
use App\Http\Controllers\SampleIntakeValidationController;

Route::prefix('v1')->group(function () {

    /*
    |----------------------------------------------------------------------
    | DEBUG (sementara)
    |----------------------------------------------------------------------
    | Akses:
    | - https://lims.localhost/api/v1/debug/session
    | - https://lims.localhost/api/v1/debug/client
    |----------------------------------------------------------------------
    */

    Route::get('/debug/session', function (Request $request) {
        return response()->json([
            'authorization_header' => $request->header('authorization'),
            'bearer_token'         => $request->bearerToken(),
            'has_session'          => $request->hasSession(),
            'auth_web'             => Auth::guard('web')->user()?->email,
            'auth_sanctum'         => Auth::guard('sanctum')->user()?->email,
            'request_user'         => $request->user()?->email,
        ]);
    });

    Route::get('/debug/client', function (Request $request) {
        return response()->json([
            'authorization_header' => $request->header('authorization'),
            'bearer_token'         => $request->bearerToken(),
            'has_session'          => $request->hasSession(),
            'session_id'           => $request->hasSession() ? $request->session()->getId() : null,

            // staff session guard
            'auth_web'             => Auth::guard('web')->user()?->email,

            // client guards
            'auth_client_session'  => Auth::guard('client')->user()?->email,
            'auth_client_api'      => Auth::guard('client_api')->user()?->email,

            // request->user() by guard
            'request_user_default' => optional($request->user())->email,
            'request_user_client'  => optional($request->user('client'))->email,
            'request_user_client_api' => optional($request->user('client_api'))->email,
        ]);
    });

    /*
    |----------------------------------------------------------------------
    | PUBLIC AUTH ENDPOINTS
    |----------------------------------------------------------------------
    */

    // Staff auth (backoffice)
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/register', [AuthController::class, 'register']);

    // Client auth (portal) - token based
    Route::post('/clients/register', [ClientAuthController::class, 'register']);
    Route::post('/clients/login', [ClientAuthController::class, 'login']);

    // Client profile & logout should be protected by client_api token
    Route::middleware('auth:client_api')->group(function () {
        Route::get('/clients/me', [ClientAuthController::class, 'me']);
        Route::post('/clients/logout', [ClientAuthController::class, 'logout']);
    });

    // Staff register (backoffice)
    Route::post('/staffs/register', [StaffRegistrationController::class, 'register']);

    /*
    |----------------------------------------------------------------------
    | CLIENT PORTAL API (TOKEN: client_api)
    |----------------------------------------------------------------------
    */

    Route::middleware(['auth:client_api', \App\Http\Middleware\EnsureClient::class])
        ->prefix('client')
        ->group(function () {
            // Sample Requests (portal)
            Route::get('samples', [ClientSampleRequestController::class, 'index']);
            Route::post('samples', [ClientSampleRequestController::class, 'store']);
            Route::get('samples/{sample}', [ClientSampleRequestController::class, 'show'])->whereNumber('sample');
            Route::patch('samples/{sample}', [ClientSampleRequestController::class, 'update'])->whereNumber('sample');
            Route::post('samples/{sample}/submit', [ClientSampleRequestController::class, 'submit'])->whereNumber('sample');

            // Client LOA sign (portal)
            Route::post('loa/{loaId}/sign', [\App\Http\Controllers\ClientLoaController::class, 'sign']);
        });

    /*
    |----------------------------------------------------------------------
    | STAFF / BACKOFFICE API (TOKEN: sanctum -> staff)
    |----------------------------------------------------------------------
    */

    Route::middleware('auth:sanctum')->group(function () {

        // staff session/me/logout (backoffice)
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // Parameters
        Route::get('/parameters', [ParameterController::class, 'index']);
        Route::post('/parameters', [ParameterController::class, 'store']);
        Route::patch('/parameters/{parameter}', [ParameterController::class, 'update']);
        Route::delete('/parameters/{parameter}', [ParameterController::class, 'destroy']);

        // Methods
        Route::get('/methods', [MethodController::class, 'index']);
        Route::post('/methods', [MethodController::class, 'store']);
        Route::patch('/methods/{method}', [MethodController::class, 'update']);
        Route::delete('/methods/{method}', [MethodController::class, 'destroy']);

        // Reagents
        Route::get('/reagents', [ReagentController::class, 'index']);

        // Clients (admin)
        Route::get('clients', [ClientController::class, 'index']);
        Route::get('clients/{client}', [ClientController::class, 'show']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::patch('/clients/{client}', [ClientController::class, 'update']);
        Route::put('/clients/{client}', [ClientController::class, 'update']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::get('clients/{client}/samples', [ClientController::class, 'samples']);

        // Samples (admin)
        Route::get('samples', [SampleController::class, 'index']);
        Route::post('samples', [SampleController::class, 'store']);
        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus']);
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index']);

        Route::get('samples/{sample}/comments', [SampleCommentController::class, 'index']);
        Route::post('samples/{sample}/comments', [SampleCommentController::class, 'store']);

        // Staff approval
        Route::get('/staffs/pending', [StaffApprovalController::class, 'pending']);
        Route::post('/staffs/{staff}/approve', [StaffApprovalController::class, 'approve']);
        Route::post('/staffs/{staff}/reject', [StaffApprovalController::class, 'reject']);

        // Client verification
        Route::get('/clients/pending', [ClientVerificationController::class, 'pending']);
        Route::post('/clients/{client}/approve', [ClientVerificationController::class, 'approve']);
        Route::post('/clients/{client}/reject', [ClientVerificationController::class, 'reject']);

        // Debug policy
        Route::get('/debug/policy/sample-test', function (Request $request) {
            $user = $request->user();

            return response()->json([
                'user' => [
                    'id'    => $user?->getAuthIdentifier(),
                    'email' => $user?->email ?? null,
                    'role'  => $user?->role?->name ?? null,
                ],
                'abilities' => [
                    'bulk_create' => $user ? $user->can('bulkCreate', [\App\Models\SampleTest::class, \App\Models\Sample::query()->first()]) : false,
                    'decide_om'   => $user ? $user->can('decideAsOM', new \App\Models\SampleTest) : false,
                    'decide_lh'   => $user ? $user->can('decideAsLH', new \App\Models\SampleTest) : false,
                    'analyst_update_status' => $user ? $user->can('updateStatusAsAnalyst', new \App\Models\SampleTest) : false,
                ],
            ]);
        });

        // Sample tests
        Route::post('samples/{sample}/sample-tests/bulk', [SampleTestBulkController::class, 'store']);
        Route::post('/sample-tests/{sampleTest}/status', [SampleTestStatusController::class, 'update']);

        Route::post('sample-tests/{sampleTest}/om/decision', [SampleTestDecisionController::class, 'omDecision']);
        Route::post('sample-tests/{sampleTest}/lh/decision', [SampleTestDecisionController::class, 'lhDecision']);
        Route::post('sample-tests/{sampleTest}/verify', [SampleTestDecisionController::class, 'verifyAsOM']);
        Route::post('sample-tests/{sampleTest}/validate', [SampleTestDecisionController::class, 'validateAsLH']);

        // Test results
        Route::post('/sample-tests/{sampleTest}/results', [TestResultController::class, 'store']);
        Route::patch('/test-results/{testResult}', [TestResultController::class, 'update']);

        // Reagent calculation
        Route::get('/samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'showBySample']);
        Route::post('/reagent-calculations/{calc}/request-approval', [ReagentCalculationController::class, 'requestApproval']);
        Route::post('/reagent-calculations/{calc}/approve', [ReagentCalculationController::class, 'approve']);
        Route::patch('/reagent-calculations/{calc}', [ReagentCalculationController::class, 'update']);
        Route::get('/samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'show']);
        Route::patch('/samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'update']);
        Route::post('/samples/{sample}/reagent-calculation/om-approve', [ReagentCalculationController::class, 'omApprove']);

        // Public COA verification (left here as you had it)
        Route::get('/verify/coa/{hash}', [PublicCoaVerificationController::class, 'verify']);

        // Units & sample tests
        Route::get('units', [UnitController::class, 'index']);
        Route::get('samples/{sample}/sample-tests', [SampleTestController::class, 'indexBySample']);

        // QC
        Route::get('qc-controls', [QcControlController::class, 'index']);
        Route::get('samples/{sample}/qc-controls', [QcControlController::class, 'forSample']);
        Route::post('samples/{sample}/qc-runs', [QcRunController::class, 'store']);
        Route::get('samples/{sample}/qc-summary', [QcRunController::class, 'summary']);

        // Audit logs
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/audit-logs/export', [AuditLogController::class, 'exportCsv']);
        Route::get('/audit-logs/export/pdf', [AuditLogController::class, 'exportPdf']);

        // Reports
        Route::post('/samples/{sample}/reports', [ReportController::class, 'store'])->whereNumber('sample');
        Route::get('/reports', [ReportController::class, 'index']);
        Route::get('/reports/{report}', [ReportController::class, 'show'])->whereNumber('report');
        Route::post('/reports/{report}/sign', [ReportSignatureController::class, 'sign'])->whereNumber('report');
        Route::post('/reports/{report}/finalize', [ReportController::class, 'finalize'])->whereNumber('report');

        // COA PDF
        Route::get('/reports/{report}/pdf', [CoaPdfController::class, 'downloadByReport'])->whereNumber('report');
        Route::get('/samples/{sample}/coa', [CoaPdfController::class, 'downloadBySample'])->whereNumber('sample');

        // Sample requests queue
        Route::get('samples/requests', [SampleRequestQueueController::class, 'index']);
        Route::post('samples/{sample}/request-status', [SampleRequestStatusController::class, 'update'])->whereNumber('sample');

        // Sample detail/update
        Route::get('samples/{sample}', [SampleController::class, 'show'])->whereNumber('sample');
        Route::patch('samples/{sample}', [SampleController::class, 'update'])->whereNumber('sample');
        Route::put('samples/{sample}', [SampleController::class, 'update'])->whereNumber('sample');

        // Intake
        Route::post('samples/{sample}/intake-checklist', [SampleIntakeChecklistController::class, 'store'])->whereNumber('sample');
        Route::post('samples/{sample}/intake-validate', [SampleIntakeValidationController::class, 'validateIntake'])->whereNumber('sample');

        // LOA (staff)
        Route::post('/samples/{sampleId}/loa', [\App\Http\Controllers\LetterOfOrderController::class, 'generate']);
        Route::post('/loa/{loaId}/sign', [\App\Http\Controllers\LetterOfOrderController::class, 'signInternal']);
        Route::post('/loa/{loaId}/send', [\App\Http\Controllers\LetterOfOrderController::class, 'sendToClient']);
    });
});
