<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

// Auth & Users
use App\Http\Controllers\AuthController;
use App\Http\Controllers\StaffApprovalController;
use App\Http\Controllers\StaffRegistrationController;

// Clients (Portal + Backoffice)
use App\Http\Controllers\ClientAuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\ClientVerificationController;

// Portal Sample Requests
use App\Http\Controllers\ClientSampleRequestController;
use App\Http\Controllers\SampleRequestQueueController;
use App\Http\Controllers\SampleRequestStatusController;

// Sample ID Approval Flow
use App\Http\Controllers\SampleIdAdminController;
use App\Http\Controllers\SampleIdChangeRequestController;

// Samples & Workflow
use App\Http\Controllers\SampleArchiveController;
use App\Http\Controllers\SampleCommentController;
use App\Http\Controllers\SampleController;
use App\Http\Controllers\SampleCrosscheckController;
use App\Http\Controllers\SamplePhysicalWorkflowController;
use App\Http\Controllers\SampleStatusHistoryController;

// Intake
use App\Http\Controllers\SampleIntakeChecklistController;
use App\Http\Controllers\SampleIntakeValidationController;
use App\Http\Controllers\SampleVerificationController;

// QA / Master Data
use App\Http\Controllers\ConsumablesCatalogController;
use App\Http\Controllers\EquipmentBookingController;
use App\Http\Controllers\EquipmentCatalogController;
use App\Http\Controllers\MethodController;
use App\Http\Controllers\ParameterController;
use App\Http\Controllers\ReagentController;
use App\Http\Controllers\ReagentRequestController;
use App\Http\Controllers\UnitController;

// Sample Tests & Results
use App\Http\Controllers\SampleTestBulkController;
use App\Http\Controllers\SampleTestController;
use App\Http\Controllers\SampleTestDecisionController;
use App\Http\Controllers\SampleTestStatusController;
use App\Http\Controllers\TestResultController;

// Reagent Calculation
use App\Http\Controllers\ReagentCalculationController;

// QC
use App\Http\Controllers\QcControlController;
use App\Http\Controllers\QcRunController;

// Quality Cover (Analyst)
use App\Http\Controllers\QualityCoverController;

// Audit & Reports
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\CoaDownloadController;
use App\Http\Controllers\PublicCoaVerificationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReportSignatureController;

// LOO
use App\Http\Controllers\LetterOfOrderController;
use App\Http\Controllers\LooSignatureVerificationController;

Route::prefix('v1')->group(function () {
    /*
    |--------------------------------------------------------------------------
    | DEBUG (temporary)
    |--------------------------------------------------------------------------
    | Access:
    | - GET /api/v1/debug/session
    | - GET /api/v1/debug/client
    |--------------------------------------------------------------------------
    */
    Route::get('debug/session', function (Request $request) {
        return response()->json([
            'authorization_header' => $request->header('authorization'),
            'bearer_token' => $request->bearerToken(),
            'has_session' => $request->hasSession(),
            'auth_web' => Auth::guard('web')->user()?->email,
            'auth_sanctum' => Auth::guard('sanctum')->user()?->email,
            'request_user' => $request->user()?->email,
        ]);
    });

    Route::get('debug/client', function (Request $request) {
        return response()->json([
            'authorization_header' => $request->header('authorization'),
            'bearer_token' => $request->bearerToken(),
            'has_session' => $request->hasSession(),
            'session_id' => $request->hasSession() ? $request->session()->getId() : null,

            // staff session guard
            'auth_web' => Auth::guard('web')->user()?->email,

            // client guards
            'auth_client_session' => Auth::guard('client')->user()?->email,
            'auth_client_api' => Auth::guard('client_api')->user()?->email,

            // request->user() by guard
            'request_user_default' => optional($request->user())->email,
            'request_user_client' => optional($request->user('client'))->email,
            'request_user_client_api' => optional($request->user('client_api'))->email,
        ]);
    });

    /*
    |--------------------------------------------------------------------------
    | PUBLIC AUTH (no token)
    |--------------------------------------------------------------------------
    */

    // Staff auth (backoffice)
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('auth/register', [AuthController::class, 'register']);

    // Staff registration (backoffice)
    Route::post('staffs/register', [StaffRegistrationController::class, 'register']);

    // Client auth (portal) - token based
    Route::post('clients/register', [ClientAuthController::class, 'register']);
    Route::post('clients/login', [ClientAuthController::class, 'login']);

    // Client profile & logout (client_api token)
    Route::middleware('auth:client_api')->group(function () {
        Route::get('clients/me', [ClientAuthController::class, 'me']);
        Route::post('clients/logout', [ClientAuthController::class, 'logout']);
    });

    /*
    |--------------------------------------------------------------------------
    | CLIENT PORTAL API (token: client_api)
    |--------------------------------------------------------------------------
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

            // Parameters (portal)
            Route::get('parameters', [ParameterController::class, 'index']);
        });

    /*
    |--------------------------------------------------------------------------
    | STAFF / BACKOFFICE API (token: sanctum -> staff)
    |--------------------------------------------------------------------------
    */
    Route::middleware('auth:sanctum')->group(function () {
        /*
        |----------------------------------------------------------------------
        | Staff session
        |----------------------------------------------------------------------
        */
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        /*
        |----------------------------------------------------------------------
        | Master Data (QA)
        |----------------------------------------------------------------------
        */
        // Parameters
        Route::get('parameters', [ParameterController::class, 'index']);
        Route::post('parameters', [ParameterController::class, 'store']);
        Route::patch('parameters/{parameter}', [ParameterController::class, 'update']);
        Route::delete('parameters/{parameter}', [ParameterController::class, 'destroy']);

        // Methods
        Route::get('methods', [MethodController::class, 'index']);
        Route::post('methods', [MethodController::class, 'store']);
        Route::patch('methods/{method}', [MethodController::class, 'update']);
        Route::delete('methods/{method}', [MethodController::class, 'destroy']);

        // Reagents
        Route::get('reagents', [ReagentController::class, 'index']);

        // Units
        Route::get('units', [UnitController::class, 'index']);

        /*
        |----------------------------------------------------------------------
        | Catalog (Consumables/Reagents)
        |----------------------------------------------------------------------
        */
        Route::get('catalog/consumables', [ConsumablesCatalogController::class, 'index']);

        /*
        |----------------------------------------------------------------------
        | Equipment Bookings (planned vs actual)
        |----------------------------------------------------------------------
        */
        Route::post('equipment-bookings', [EquipmentBookingController::class, 'store']);
        Route::patch('equipment-bookings/{bookingId}', [EquipmentBookingController::class, 'update']);
        Route::patch('equipment-bookings/{bookingId}/actual', [EquipmentBookingController::class, 'updateActual']);
        Route::get('equipment/catalog', [EquipmentCatalogController::class, 'index']);

        /*
        |----------------------------------------------------------------------
        | Reagent Requests
        |----------------------------------------------------------------------
        */
        Route::get('reagent-requests', [ReagentRequestController::class, 'indexApproverInbox']);
        Route::get('reagent-requests/loo/{loId}', [ReagentRequestController::class, 'showByLoo']);
        Route::post('reagent-requests/draft', [ReagentRequestController::class, 'saveDraft']);
        Route::post('reagent-requests/{id}/submit', [ReagentRequestController::class, 'submit']);
        Route::post('reagent-requests/{id}/approve', [ReagentRequestController::class, 'approve']);
        Route::post('reagent-requests/{id}/reject', [ReagentRequestController::class, 'reject']);

        /*
        |----------------------------------------------------------------------
        | Staff Approvals
        |----------------------------------------------------------------------
        */
        Route::get('staffs/pending', [StaffApprovalController::class, 'pending']);
        Route::post('staffs/{staff}/approve', [StaffApprovalController::class, 'approve']);
        Route::post('staffs/{staff}/reject', [StaffApprovalController::class, 'reject']);

        /*
        |----------------------------------------------------------------------
        | Client Approvals (Applications table)
        |----------------------------------------------------------------------
        */
        Route::get('clients/pending', [ClientVerificationController::class, 'pending']);
        Route::post('clients/{applicationId}/approve', [ClientVerificationController::class, 'approve'])
            ->whereNumber('applicationId');
        Route::post('clients/{applicationId}/reject', [ClientVerificationController::class, 'reject'])
            ->whereNumber('applicationId');

        /*
        |----------------------------------------------------------------------
        | Clients (admin/backoffice)
        |----------------------------------------------------------------------
        */
        Route::get('clients', [ClientController::class, 'index']);
        Route::get('clients/{client}', [ClientController::class, 'show']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::patch('clients/{client}', [ClientController::class, 'update']);
        Route::put('clients/{client}', [ClientController::class, 'update']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::get('clients/{client}/samples', [ClientController::class, 'samples']);

        /*
        |----------------------------------------------------------------------
        | Samples
        |----------------------------------------------------------------------
        */
        Route::get('samples', [SampleController::class, 'index']);
        Route::post('samples', [SampleController::class, 'store']);
        Route::get('samples/{sample}', [SampleController::class, 'show'])->whereNumber('sample');
        Route::patch('samples/{sample}', [SampleController::class, 'update'])->whereNumber('sample');
        Route::put('samples/{sample}', [SampleController::class, 'update'])->whereNumber('sample');

        // Sample Archives
        Route::get('sample-archive', [SampleArchiveController::class, 'index']);
        Route::get('sample-archive/{sampleId}', [SampleArchiveController::class, 'show'])
            ->whereNumber('sampleId');

        // Physical workflow (single canonical route)
        Route::patch('samples/{sample}/physical-workflow', [SamplePhysicalWorkflowController::class, 'update'])
            ->whereNumber('sample');

        // Custody log (if still used)
        Route::post('samples/{sample}/custody', [SamplePhysicalWorkflowController::class, 'store'])
            ->whereNumber('sample');

        // Legacy handoff endpoints (keep for backward compatibility, optional)
        Route::post('samples/{sample}/handoff/sc-delivered', [SamplePhysicalWorkflowController::class, 'scDelivered'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/handoff/analyst-received', [SamplePhysicalWorkflowController::class, 'analystReceived'])
            ->whereNumber('sample');

        // Crosscheck (Todo 2)
        Route::patch('samples/{sample}/crosscheck', [SampleCrosscheckController::class, 'submit'])
            ->whereNumber('sample');

        // Sample status & history
        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus'])->whereNumber('sample');
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index'])->whereNumber('sample');

        // Sample comments
        Route::get('samples/{sample}/comments', [SampleCommentController::class, 'index'])->whereNumber('sample');
        Route::post('samples/{sample}/comments', [SampleCommentController::class, 'store'])->whereNumber('sample');

        /*
        |----------------------------------------------------------------------
        | Sample Requests Queue (admin)
        |----------------------------------------------------------------------
        */
        Route::get('samples/requests', [SampleRequestQueueController::class, 'index']);
        Route::post('samples/{sample}/request-status', [SampleRequestStatusController::class, 'update'])
            ->whereNumber('sample');

        /*
        |----------------------------------------------------------------------
        | Sample ID Suggestion + Assign (Admin)
        |----------------------------------------------------------------------
        */
        Route::get('sample-requests/{sample}/sample-id/suggestion', [SampleIdAdminController::class, 'suggestion'])
            ->whereNumber('sample');
        Route::post('sample-requests/{sample}/sample-id/assign', [SampleIdAdminController::class, 'assign'])
            ->whereNumber('sample');
        Route::post('sample-requests/{sample}/sample-id/propose-change', [SampleIdAdminController::class, 'proposeChange'])
            ->whereNumber('sample');

        // Legacy aliases (kept for backward compatibility)
        Route::get('samples/{sample}/sample-id-suggestion', [SampleIdAdminController::class, 'suggestion'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/assign-sample-id', [SampleIdAdminController::class, 'assign'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/propose-sample-id-change', [SampleIdAdminController::class, 'proposeChange'])
            ->whereNumber('sample');

        /*
        |----------------------------------------------------------------------
        | Sample ID Change Requests (OM/LH)
        |----------------------------------------------------------------------
        */
        Route::get('sample-id-change-requests', [SampleIdChangeRequestController::class, 'index']);
        Route::get('sample-id-change-requests/by-sample/{sample}', [SampleIdChangeRequestController::class, 'latestBySample'])
            ->whereNumber('sample'); // ✅ NEW
        Route::get('sample-id-change-requests/{changeRequestId}', [SampleIdChangeRequestController::class, 'show'])
            ->whereNumber('changeRequestId');
        Route::post('sample-id-change-requests/{changeRequestId}/approve', [SampleIdChangeRequestController::class, 'approve'])
            ->whereNumber('changeRequestId');
        Route::post('sample-id-change-requests/{changeRequestId}/reject', [SampleIdChangeRequestController::class, 'reject'])
            ->whereNumber('changeRequestId');

        // Legacy aliases
        Route::get('sample-id-changes', [SampleIdChangeRequestController::class, 'index']);
        Route::get('sample-id-changes/by-sample/{sample}', [SampleIdChangeRequestController::class, 'latestBySample'])
            ->whereNumber('sample'); // ✅ NEW
        Route::get('sample-id-changes/{changeRequestId}', [SampleIdChangeRequestController::class, 'show'])
            ->whereNumber('changeRequestId');
        Route::post('sample-id-changes/{changeRequestId}/approve', [SampleIdChangeRequestController::class, 'approve'])
            ->whereNumber('changeRequestId');
        Route::post('sample-id-changes/{changeRequestId}/reject', [SampleIdChangeRequestController::class, 'reject'])
            ->whereNumber('changeRequestId');

        // Legacy aliases (kept for backward compatibility)
        Route::get('sample-id-changes', [SampleIdChangeRequestController::class, 'index']);
        Route::get('sample-id-changes/{changeRequestId}', [SampleIdChangeRequestController::class, 'show'])
            ->whereNumber('changeRequestId');
        Route::post('sample-id-changes/{changeRequestId}/approve', [SampleIdChangeRequestController::class, 'approve'])
            ->whereNumber('changeRequestId');
        Route::post('sample-id-changes/{changeRequestId}/reject', [SampleIdChangeRequestController::class, 'reject'])
            ->whereNumber('changeRequestId');

        /*
        |----------------------------------------------------------------------
        | Intake
        |----------------------------------------------------------------------
        */
        Route::post('samples/{sample}/intake-checklist', [SampleIntakeChecklistController::class, 'store'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/verify', [SampleVerificationController::class, 'verify'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/intake-validate', [SampleIntakeValidationController::class, 'validateIntake'])
            ->whereNumber('sample');

        /*
        |----------------------------------------------------------------------
        | Sample Tests & Results
        |----------------------------------------------------------------------
        */
        Route::post('samples/{sample}/sample-tests/bulk', [SampleTestBulkController::class, 'store'])
            ->whereNumber('sample');
        Route::get('samples/{sample}/sample-tests', [SampleTestController::class, 'indexBySample'])
            ->whereNumber('sample');
        Route::post('sample-tests/{sampleTest}/status', [SampleTestStatusController::class, 'update'])
            ->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/om/decision', [SampleTestDecisionController::class, 'omDecision'])
            ->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/lh/decision', [SampleTestDecisionController::class, 'lhDecision'])
            ->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/verify', [SampleTestDecisionController::class, 'verifyAsOM'])
            ->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/validate', [SampleTestDecisionController::class, 'validateAsLH'])
            ->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/results', [TestResultController::class, 'store'])
            ->whereNumber('sampleTest');
        Route::patch('test-results/{testResult}', [TestResultController::class, 'update'])
            ->whereNumber('testResult');

        /*
        |----------------------------------------------------------------------
        | Analyst Testing Board (Kanban)
        |----------------------------------------------------------------------
        */
        Route::post('testing-board/move', [\App\Http\Controllers\TestingBoardController::class, 'move']);
        Route::get('testing-board/{workflowGroup}', [\App\Http\Controllers\TestingBoardController::class, 'show'])
            ->where('workflowGroup', '^[a-z0-9_]+$');
        Route::patch('testing-board/columns/{columnId}', [\App\Http\Controllers\TestingBoardController::class, 'renameColumn'])
            ->whereNumber('columnId');
        Route::post('testing-board/{workflowGroup}/columns', [\App\Http\Controllers\TestingBoardController::class, 'addColumn'])
            ->where('workflowGroup', '^[a-z0-9_]+$');
        Route::put('testing-board/{workflowGroup}/columns/reorder', [\App\Http\Controllers\TestingBoardController::class, 'reorderColumns'])
            ->where('workflowGroup', '^[a-z0-9_]+$');
        Route::delete('testing-board/columns/{columnId}', [\App\Http\Controllers\TestingBoardController::class, 'deleteColumn'])
            ->whereNumber('columnId');

        /*
        |----------------------------------------------------------------------
        | Reagent Calculation
        |----------------------------------------------------------------------
        */
        Route::get('samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'showBySample'])
            ->whereNumber('sample');
        Route::patch('samples/{sample}/reagent-calculation', [ReagentCalculationController::class, 'update'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/reagent-calculation/om-approve', [ReagentCalculationController::class, 'omApprove'])
            ->whereNumber('sample');
        Route::post('reagent-calculations/{calc}/request-approval', [ReagentCalculationController::class, 'requestApproval'])
            ->whereNumber('calc');
        Route::post('reagent-calculations/{calc}/approve', [ReagentCalculationController::class, 'approve'])
            ->whereNumber('calc');
        Route::patch('reagent-calculations/{calc}', [ReagentCalculationController::class, 'update'])
            ->whereNumber('calc');

        /*
        |----------------------------------------------------------------------
        | QC
        |----------------------------------------------------------------------
        */
        Route::get('qc-controls', [QcControlController::class, 'index']);
        Route::get('samples/{sample}/qc-controls', [QcControlController::class, 'forSample'])->whereNumber('sample');
        Route::post('samples/{sample}/qc-runs', [QcRunController::class, 'store'])->whereNumber('sample');
        Route::get('samples/{sample}/qc-summary', [QcRunController::class, 'summary'])->whereNumber('sample');

        /*
        |----------------------------------------------------------------------
        | Quality Cover
        |----------------------------------------------------------------------
        */
        Route::get('samples/{sample}/quality-cover', [QualityCoverController::class, 'show'])
            ->whereNumber('sample');
        Route::put('samples/{sample}/quality-cover/draft', [QualityCoverController::class, 'saveDraft'])
            ->whereNumber('sample');
        Route::post('samples/{sample}/quality-cover/submit', [QualityCoverController::class, 'submit'])
            ->whereNumber('sample');

        Route::get('quality-covers/inbox/om', [QualityCoverController::class, 'inboxOm']);
        Route::post('quality-covers/{qualityCover}/verify', [QualityCoverController::class, 'omVerify'])
            ->whereNumber('qualityCover');
        Route::post('quality-covers/{qualityCover}/reject', [QualityCoverController::class, 'omReject'])
            ->whereNumber('qualityCover');

        Route::get('quality-covers/inbox/lh', [QualityCoverController::class, 'inboxLh']);
        Route::post('quality-covers/{qualityCover}/validate', [QualityCoverController::class, 'lhValidate'])
            ->whereNumber('qualityCover');
        Route::post('quality-covers/{qualityCover}/reject-lh', [QualityCoverController::class, 'lhReject'])
            ->whereNumber('qualityCover');

        Route::get('quality-covers/{qualityCover}', [QualityCoverController::class, 'showById'])
            ->whereNumber('qualityCover');

        /*
        |----------------------------------------------------------------------
        | Audit Logs
        |----------------------------------------------------------------------
        */
        Route::get('audit-logs', [AuditLogController::class, 'index']);
        Route::get('audit-logs/export', [AuditLogController::class, 'exportCsv']);
        Route::get('audit-logs/export/pdf', [AuditLogController::class, 'exportPdf']);

        /*
        |----------------------------------------------------------------------
        | Reports & COA
        |----------------------------------------------------------------------
        */
        Route::post('samples/{sample}/reports', [ReportController::class, 'store'])->whereNumber('sample');
        Route::get('reports', [ReportController::class, 'index']);
        Route::get('reports/{report}', [ReportController::class, 'show'])->whereNumber('report');
        Route::post('reports/{report}/sign', [ReportSignatureController::class, 'sign'])->whereNumber('report');
        Route::post('reports/{report}/finalize', [ReportController::class, 'finalize'])->whereNumber('report');

        Route::get('reports/documents', [\App\Http\Controllers\ReportDocumentsController::class, 'index']);
        Route::get('reports/documents/{type}/{id}/pdf', [\App\Http\Controllers\ReportDocumentsController::class, 'pdf']);

        // COA PDF
        Route::get('samples/{sample}/coa', [CoaDownloadController::class, 'bySample'])->whereNumber('sample');
        Route::get('reports/{report}/pdf', [CoaDownloadController::class, 'byReport'])->whereNumber('report');

        // Public COA verification
        Route::get('verify/coa/{hash}', [PublicCoaVerificationController::class, 'verify']);

        // Public LOO verification (QR target)
        Route::get('verify/loo/{hash}', [\App\Http\Controllers\PublicLooVerificationController::class, 'verify'])
            ->where('hash', '[A-Fa-f0-9]{64}');

        /*
        |----------------------------------------------------------------------
        | LOO (staff)
        |----------------------------------------------------------------------
        */
        Route::post('samples/{sampleId}/loo', [LetterOfOrderController::class, 'generate']);
        Route::get('letters-of-order/{looId}', [LetterOfOrderController::class, 'show'])
            ->whereNumber('looId');
        Route::get('loo/{looId}', [LetterOfOrderController::class, 'show'])
            ->whereNumber('looId');

        Route::post('loo/{looId}/sign', [LetterOfOrderController::class, 'signInternal']);
        Route::post('loo/{looId}/send', [LetterOfOrderController::class, 'sendToClient']);

        /*
        |----------------------------------------------------------------------
        | LOO Approvals (OM/LH) - per sample gate
        |----------------------------------------------------------------------
        */
        Route::get('loo/approvals', [\App\Http\Controllers\LooSampleApprovalController::class, 'index']);
        Route::patch('loo/approvals/{sample}', [\App\Http\Controllers\LooSampleApprovalController::class, 'update'])
            ->whereNumber('sample');

        /*
        |----------------------------------------------------------------------
        | LOO Signature Verification (QR target)
        |----------------------------------------------------------------------
        */
        Route::get('loo/signatures/verify/{hash}', [LooSignatureVerificationController::class, 'show'])
            ->where('hash', '[A-Fa-f0-9]{64}');

        /*
        |----------------------------------------------------------------------
        | Policy debug (temporary)
        |----------------------------------------------------------------------
        */
        Route::get('debug/policy/sample-test', function (Request $request) {
            $user = $request->user();

            return response()->json([
                'user' => [
                    'id' => $user?->getAuthIdentifier(),
                    'email' => $user?->email ?? null,
                    'role' => $user?->role?->name ?? null,
                ],
                'abilities' => [
                    'bulk_create' => $user
                        ? $user->can('bulkCreate', [\App\Models\SampleTest::class, \App\Models\Sample::query()->first()])
                        : false,
                    'decide_om' => $user ? $user->can('decideAsOM', new \App\Models\SampleTest) : false,
                    'decide_lh' => $user ? $user->can('decideAsLH', new \App\Models\SampleTest) : false,
                    'analyst_update_status' => $user ? $user->can('updateStatusAsAnalyst', new \App\Models\SampleTest) : false,
                ],
            ]);
        });
    });
});
