<?php

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
use App\Http\Controllers\SampleWorkflowLogsController;

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
use App\Http\Controllers\ClientParameterController;
use App\Http\Controllers\ParameterRequestController;
use App\Http\Controllers\ReagentController;
use App\Http\Controllers\ReagentRequestController;
use App\Http\Controllers\ReagentRequestDocumentController;
use App\Http\Controllers\UnitController;

// Sample Tests & Results
use App\Http\Controllers\SampleTestBulkController;
use App\Http\Controllers\SampleTestController;
use App\Http\Controllers\SampleTestDecisionController;
use App\Http\Controllers\SampleTestStatusController;
use App\Http\Controllers\TestResultController;

// Quality Cover (Analyst)
use App\Http\Controllers\QualityCoverController;

// Audit & Reports
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\CoaDownloadController;
use App\Http\Controllers\PublicCoaVerificationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReportSignatureController;
use App\Http\Controllers\ReportDeliveryController;

// Documents
use App\Http\Controllers\DocumentTemplateController;
use App\Http\Controllers\FileController;

// LOO
use App\Http\Controllers\LetterOfOrderController;
use App\Http\Controllers\LooSignatureVerificationController;

// Middleware
use App\Http\Middleware\EnsureClient;
use App\Http\Middleware\EnsureStaff;

Route::prefix('v1')->group(function () {
    /*
    |----------------------------------------------------------------------
    | PUBLIC AUTH (no token)
    |----------------------------------------------------------------------
    */
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('staffs/register', [StaffRegistrationController::class, 'register']);

    Route::post('clients/register', [ClientAuthController::class, 'register']);
    Route::post('clients/login', [ClientAuthController::class, 'login']);

    /*
    |----------------------------------------------------------------------
    | CLIENT (token: client_api)
    |----------------------------------------------------------------------
    */
    Route::middleware('auth:client_api')->group(function () {
        Route::get('clients/me', [ClientAuthController::class, 'me']);
        Route::patch('clients/me', [ClientAuthController::class, 'updateLocale']);
        Route::post('clients/logout', [ClientAuthController::class, 'logout']);
    });

    Route::middleware(['auth:client_api', EnsureClient::class])
        ->prefix('client')
        ->group(function () {
            Route::get('samples', [ClientSampleRequestController::class, 'index']);
            Route::post('samples', [ClientSampleRequestController::class, 'store']);
            Route::get('samples/{sample}', [ClientSampleRequestController::class, 'show'])->whereNumber('sample');
            Route::patch('samples/{sample}', [ClientSampleRequestController::class, 'update'])->whereNumber('sample');
            Route::post('samples/{sample}/submit', [ClientSampleRequestController::class, 'submit'])->whereNumber('sample');

            Route::get('parameters', [ClientParameterController::class, 'index']);
        });

    /*
    |----------------------------------------------------------------------
    | STAFF / BACKOFFICE (token: sanctum -> Staff)
    |----------------------------------------------------------------------
    */
    Route::middleware(['auth:sanctum', EnsureStaff::class])->group(function () {
        // staff session
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::patch('auth/me', [AuthController::class, 'updateLocale']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        /*
        |------------------------------------------------------------------
        | Master Data (QA)
        |------------------------------------------------------------------
        */
        Route::apiResource('parameters', ParameterController::class)->only(['index', 'store', 'destroy']);

        Route::post('parameters/requests', [ParameterRequestController::class, 'store']);
        Route::get('parameter-requests', [ParameterRequestController::class, 'index']);
        Route::post('parameter-requests/{id}/approve', [ParameterRequestController::class, 'approve'])->whereNumber('id');
        Route::post('parameter-requests/{id}/reject', [ParameterRequestController::class, 'reject'])->whereNumber('id');

        Route::post('parameter-requests/{id}/ack', [ParameterRequestController::class, 'acknowledge'])
            ->whereNumber('id');

        Route::apiResource('methods', MethodController::class)->only(['index', 'store', 'update', 'destroy']);

        Route::get('reagents', [ReagentController::class, 'index']);
        Route::get('units', [UnitController::class, 'index']);

        /*
        |------------------------------------------------------------------
        | Catalog
        |------------------------------------------------------------------
        */
        Route::get('catalog/consumables', [ConsumablesCatalogController::class, 'index']);

        /*
        |------------------------------------------------------------------
        | Equipment
        |------------------------------------------------------------------
        */
        Route::post('equipment-bookings', [EquipmentBookingController::class, 'store']);
        Route::patch('equipment-bookings/{bookingId}', [EquipmentBookingController::class, 'update'])->whereNumber('bookingId');
        Route::patch('equipment-bookings/{bookingId}/actual', [EquipmentBookingController::class, 'updateActual'])->whereNumber('bookingId');
        Route::get('equipment/catalog', [EquipmentCatalogController::class, 'index']);

        /*
        |------------------------------------------------------------------
        | Reagent Requests
        |------------------------------------------------------------------
        */
        Route::get('reagent-requests', [ReagentRequestController::class, 'indexApproverInbox']);
        Route::get('reagent-requests/loo/{loId}', [ReagentRequestController::class, 'showByLoo'])->whereNumber('loId');
        Route::post('reagent-requests/draft', [ReagentRequestController::class, 'saveDraft']);
        Route::post('reagent-requests/{id}/submit', [ReagentRequestController::class, 'submit'])->whereNumber('id');
        Route::post('reagent-requests/{id}/approve', [ReagentRequestController::class, 'approve'])->whereNumber('id');
        Route::post('reagent-requests/{id}/reject', [ReagentRequestController::class, 'reject'])->whereNumber('id');
        Route::post('reagent-requests/{id}/generate-pdf', [ReagentRequestDocumentController::class, 'generatePdf'])->whereNumber('id');

        /*
        |------------------------------------------------------------------
        | Staff Approvals
        |------------------------------------------------------------------
        */
        Route::get('staffs/pending', [StaffApprovalController::class, 'pending']);
        Route::post('staffs/{staff}/approve', [StaffApprovalController::class, 'approve'])->whereNumber('staff');
        Route::post('staffs/{staff}/reject', [StaffApprovalController::class, 'reject'])->whereNumber('staff');

        /*
        |------------------------------------------------------------------
        | Client Approvals
        |------------------------------------------------------------------
        */
        Route::get('clients/pending', [ClientVerificationController::class, 'pending']);
        Route::post('clients/{applicationId}/approve', [ClientVerificationController::class, 'approve'])->whereNumber('applicationId');
        Route::post('clients/{applicationId}/reject', [ClientVerificationController::class, 'reject'])->whereNumber('applicationId');

        /*
        |------------------------------------------------------------------
        | Clients
        |------------------------------------------------------------------
        */
        Route::get('clients', [ClientController::class, 'index']);
        Route::get('clients/{client}', [ClientController::class, 'show'])->whereNumber('client');
        Route::post('clients', [ClientController::class, 'store']);
        Route::match(['put', 'patch'], 'clients/{client}', [ClientController::class, 'update'])->whereNumber('client');
        Route::delete('clients/{client}', [ClientController::class, 'destroy'])->whereNumber('client');
        Route::get('clients/{client}/samples', [ClientController::class, 'samples'])->whereNumber('client');

        /*
        |------------------------------------------------------------------
        | Samples
        |------------------------------------------------------------------
        */
        Route::get('samples', [SampleController::class, 'index']);
        Route::post('samples', [SampleController::class, 'store']);
        Route::get('samples/{sample}', [SampleController::class, 'show'])->whereNumber('sample');
        Route::match(['put', 'patch'], 'samples/{sample}', [SampleController::class, 'update'])->whereNumber('sample');

        Route::get('sample-archive', [SampleArchiveController::class, 'index']);
        Route::get('sample-archive/{sampleId}', [SampleArchiveController::class, 'show'])->whereNumber('sampleId');

        Route::patch('samples/{sample}/physical-workflow', [SamplePhysicalWorkflowController::class, 'update'])->whereNumber('sample');
        Route::post('samples/{sample}/custody', [SamplePhysicalWorkflowController::class, 'store'])->whereNumber('sample');

        Route::post('samples/{sample}/handoff/sc-delivered', [SamplePhysicalWorkflowController::class, 'scDelivered'])->whereNumber('sample');
        Route::post('samples/{sample}/handoff/analyst-received', [SamplePhysicalWorkflowController::class, 'analystReceived'])->whereNumber('sample');

        Route::patch('samples/{sample}/crosscheck', [SampleCrosscheckController::class, 'submit'])->whereNumber('sample');

        Route::post('samples/{sample}/status', [SampleController::class, 'updateStatus'])->whereNumber('sample');
        Route::get('samples/{sample}/status-history', [SampleStatusHistoryController::class, 'index'])->whereNumber('sample');
        Route::get('samples/{sample}/workflow-logs', [SampleWorkflowLogsController::class, 'index'])->whereNumber('sample');

        Route::get('samples/{sample}/comments', [SampleCommentController::class, 'index'])->whereNumber('sample');
        Route::post('samples/{sample}/comments', [SampleCommentController::class, 'store'])->whereNumber('sample');

        /*
        |------------------------------------------------------------------
        | Sample Requests Queue
        |------------------------------------------------------------------
        */
        Route::get('samples/requests', [SampleRequestQueueController::class, 'index']);
        Route::post('samples/{sample}/request-status', [SampleRequestStatusController::class, 'update'])->whereNumber('sample');

        /*
        |------------------------------------------------------------------
        | Sample ID Suggestion + Assign
        |------------------------------------------------------------------
        */
        Route::get('sample-requests/{sample}/sample-id/suggestion', [SampleIdAdminController::class, 'suggestion'])->whereNumber('sample');
        Route::post('sample-requests/{sample}/sample-id/assign', [SampleIdAdminController::class, 'assign'])->whereNumber('sample');
        Route::post('sample-requests/{sample}/sample-id/propose-change', [SampleIdAdminController::class, 'proposeChange'])->whereNumber('sample');

        Route::get('samples/{sample}/sample-id-suggestion', [SampleIdAdminController::class, 'suggestion'])->whereNumber('sample');
        Route::post('samples/{sample}/assign-sample-id', [SampleIdAdminController::class, 'assign'])->whereNumber('sample');
        Route::post('samples/{sample}/propose-sample-id-change', [SampleIdAdminController::class, 'proposeChange'])->whereNumber('sample');

        /*
        |------------------------------------------------------------------
        | Sample ID Change Requests (canonical + legacy alias)
        |------------------------------------------------------------------
        */
        Route::get('sample-id-change-requests', [SampleIdChangeRequestController::class, 'index']);
        Route::get('sample-id-change-requests/by-sample/{sample}', [SampleIdChangeRequestController::class, 'latestBySample'])->whereNumber('sample');
        Route::get('sample-id-change-requests/{changeRequestId}', [SampleIdChangeRequestController::class, 'show'])->whereNumber('changeRequestId');
        Route::post('sample-id-change-requests/{changeRequestId}/approve', [SampleIdChangeRequestController::class, 'approve'])->whereNumber('changeRequestId');
        Route::post('sample-id-change-requests/{changeRequestId}/reject', [SampleIdChangeRequestController::class, 'reject'])->whereNumber('changeRequestId');

        Route::get('sample-id-changes', [SampleIdChangeRequestController::class, 'index']);
        Route::get('sample-id-changes/by-sample/{sample}', [SampleIdChangeRequestController::class, 'latestBySample'])->whereNumber('sample');
        Route::get('sample-id-changes/{changeRequestId}', [SampleIdChangeRequestController::class, 'show'])->whereNumber('changeRequestId');
        Route::post('sample-id-changes/{changeRequestId}/approve', [SampleIdChangeRequestController::class, 'approve'])->whereNumber('changeRequestId');
        Route::post('sample-id-changes/{changeRequestId}/reject', [SampleIdChangeRequestController::class, 'reject'])->whereNumber('changeRequestId');

        /*
        |------------------------------------------------------------------
        | Intake
        |------------------------------------------------------------------
        */
        Route::post('samples/{sample}/intake-checklist', [SampleIntakeChecklistController::class, 'store'])->whereNumber('sample');
        Route::post('samples/{sample}/verify', [SampleVerificationController::class, 'verify'])->whereNumber('sample');
        Route::post('samples/{sample}/intake-validate', [SampleIntakeValidationController::class, 'validateIntake'])->whereNumber('sample');

        /*
        |------------------------------------------------------------------
        | Sample Tests & Results
        |------------------------------------------------------------------
        */
        Route::post('samples/{sample}/sample-tests/bulk', [SampleTestBulkController::class, 'store'])->whereNumber('sample');
        Route::get('samples/{sample}/sample-tests', [SampleTestController::class, 'indexBySample'])->whereNumber('sample');

        Route::post('sample-tests/{sampleTest}/status', [SampleTestStatusController::class, 'update'])->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/om/decision', [SampleTestDecisionController::class, 'omDecision'])->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/lh/decision', [SampleTestDecisionController::class, 'lhDecision'])->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/verify', [SampleTestDecisionController::class, 'verifyAsOM'])->whereNumber('sampleTest');
        Route::post('sample-tests/{sampleTest}/validate', [SampleTestDecisionController::class, 'validateAsLH'])->whereNumber('sampleTest');

        Route::post('sample-tests/{sampleTest}/results', [TestResultController::class, 'store'])->whereNumber('sampleTest');
        Route::patch('test-results/{testResult}', [TestResultController::class, 'update'])->whereNumber('testResult');

        /*
        |------------------------------------------------------------------
        | Analyst Testing Board (Kanban)
        |------------------------------------------------------------------
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
        |------------------------------------------------------------------
        | Quality Cover
        |------------------------------------------------------------------
        */
        Route::get('samples/{sample}/quality-cover', [QualityCoverController::class, 'show'])->whereNumber('sample');
        Route::put('samples/{sample}/quality-cover/draft', [QualityCoverController::class, 'saveDraft'])->whereNumber('sample');
        Route::post('samples/{sample}/quality-cover/submit', [QualityCoverController::class, 'submit'])->whereNumber('sample');

        Route::get('quality-covers/inbox/om', [QualityCoverController::class, 'inboxOm']);
        Route::post('quality-covers/{qualityCover}/verify', [QualityCoverController::class, 'omVerify'])->whereNumber('qualityCover');
        Route::post('quality-covers/{qualityCover}/reject', [QualityCoverController::class, 'omReject'])->whereNumber('qualityCover');

        Route::get('quality-covers/inbox/lh', [QualityCoverController::class, 'inboxLh']);
        Route::post('quality-covers/{qualityCover}/validate', [QualityCoverController::class, 'lhValidate'])->whereNumber('qualityCover');
        Route::post('quality-covers/{qualityCover}/reject-lh', [QualityCoverController::class, 'lhReject'])->whereNumber('qualityCover');

        Route::get('quality-covers/{qualityCover}', [QualityCoverController::class, 'showById'])->whereNumber('qualityCover');

        Route::post('quality-covers/{qualityCover}/supporting-files', [QualityCoverController::class, 'uploadSupportingFiles'])
            ->whereNumber('qualityCover');
        Route::delete('quality-covers/{qualityCover}/supporting-files/{fileId}', [QualityCoverController::class, 'deleteSupportingFile'])
            ->whereNumber('qualityCover')
            ->whereNumber('fileId');

        /*
        |------------------------------------------------------------------
        | Audit Logs
        |------------------------------------------------------------------
        */
        Route::get('audit-logs', [AuditLogController::class, 'index']);
        Route::get('audit-logs/export', [AuditLogController::class, 'exportCsv']);
        Route::get('audit-logs/export/pdf', [AuditLogController::class, 'exportPdf']);

        /*
        |------------------------------------------------------------------
        | Reports & COA
        |------------------------------------------------------------------
        */
        Route::post('samples/{sample}/reports', [ReportController::class, 'store'])->whereNumber('sample');
        Route::get('reports', [ReportController::class, 'index']);
        Route::get('reports/{report}', [ReportController::class, 'show'])->whereNumber('report');
        Route::post('reports/{report}/sign', [ReportSignatureController::class, 'sign'])->whereNumber('report');
        Route::post('reports/{report}/finalize', [ReportController::class, 'finalize'])->whereNumber('report');

        Route::get('reports/documents', [\App\Http\Controllers\ReportDocumentsController::class, 'index']);
        Route::get('reports/documents/{type}/{id}/pdf', [\App\Http\Controllers\ReportDocumentsController::class, 'pdf']);

        Route::post('reports/{report}/coa-check', [ReportDeliveryController::class, 'markCoaChecked'])->whereNumber('report');
        Route::post('reports/{report}/release-coa', [ReportDeliveryController::class, 'releaseCoaToClient'])->whereNumber('report');
        Route::get('client/samples/{sample}/coa', [ClientSampleRequestController::class, 'downloadCoa'])->whereNumber('sample');

        Route::get('document-templates', [DocumentTemplateController::class, 'index']);
        Route::patch('document-templates/{doc_code}', [DocumentTemplateController::class, 'update']);
        Route::post('document-templates/{doc_code}/versions', [DocumentTemplateController::class, 'uploadVersion']);
        Route::get('files/{fileId}', [FileController::class, 'show'])->whereNumber('fileId');

        Route::get('samples/{sample}/coa', [CoaDownloadController::class, 'bySample'])->whereNumber('sample');
        Route::get('reports/{report}/pdf', [CoaDownloadController::class, 'byReport'])->whereNumber('report');

        /*
        |------------------------------------------------------------------
        | Public verification
        |------------------------------------------------------------------
        */
        Route::get('verify/coa/{hash}', [PublicCoaVerificationController::class, 'verify']);
        Route::get('verify/loo/{hash}', [\App\Http\Controllers\PublicLooVerificationController::class, 'verify'])
            ->where('hash', '[A-Fa-f0-9]{64}');

        /*
        |------------------------------------------------------------------
        | LOO
        |------------------------------------------------------------------
        */
        Route::post('samples/{sampleId}/loo', [LetterOfOrderController::class, 'generate'])->whereNumber('sampleId');
        Route::get('letters-of-order/{looId}', [LetterOfOrderController::class, 'show'])->whereNumber('looId');
        Route::get('loo/{looId}', [LetterOfOrderController::class, 'show'])->whereNumber('looId');

        Route::post('loo/{looId}/sign', [LetterOfOrderController::class, 'signInternal'])->whereNumber('looId');
        Route::post('loo/{looId}/send', [LetterOfOrderController::class, 'sendToClient'])->whereNumber('looId');

        Route::get('loo/approvals', [\App\Http\Controllers\LooSampleApprovalController::class, 'index']);
        Route::patch('loo/approvals/{sample}', [\App\Http\Controllers\LooSampleApprovalController::class, 'update'])
            ->whereNumber('sample');

        Route::get('loo/signatures/verify/{hash}', [LooSignatureVerificationController::class, 'show'])
            ->where('hash', '[A-Fa-f0-9]{64}');
    });
});
