<?php

namespace App\Http\Controllers;

use App\Services\ReagentRequestDocumentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ReagentRequestDocumentController extends Controller
{
    public function __construct(private readonly ReagentRequestDocumentService $docs) {}

    private function assertOmLhOrAdminOr403(Request $request): void
    {
        $user = $request->user();
        $roleId = (int) ($user?->role_id ?? 0);
        $roleName = strtolower((string) ($user?->role?->name ?? $user?->role_name ?? ''));

        $isAdmin =
            $roleId === 2 ||
            str_contains($roleName, 'administrator') ||
            $roleName === 'admin' ||
            $roleName === 'administrator demo' ||
            $roleName === 'system role';

        $isOmOrLh =
            in_array($roleId, [5, 6], true) ||
            str_contains($roleName, 'operational manager') ||
            str_contains($roleName, 'lab head') ||
            $roleName === 'om' ||
            $roleName === 'lh';

        if (!$isAdmin && !$isOmOrLh) {
            abort(403, 'Forbidden.');
        }
    }

    /**
     * POST /api/v1/reagent-requests/{id}/generate-pdf
     * Generate official PDF (DB template -> PDF stored in files, registered in generated_documents).
     */
    public function generatePdf(Request $request, int $id): JsonResponse
    {
        $this->assertOmLhOrAdminOr403($request);

        $user = Auth::user();
        $actorStaffId = (int) ($user?->staff_id ?? $user?->id ?? 0);

        $gd = $this->docs->generateApprovedPdf($id, $actorStaffId, false);

        return response()->json([
            'ok' => true,
            'doc_code' => (string) $gd->doc_code,
            'entity_type' => (string) $gd->entity_type,
            'entity_id' => (int) $gd->entity_id,

            'record_no' => (string) $gd->record_no,
            'form_code' => (string) $gd->form_code,
            'revision_no' => (int) $gd->revision_no,
            'template_version' => (int) $gd->template_version,

            'pdf_file_id' => (int) $gd->file_pdf_id,
            'download_url' => url("/api/v1/files/{$gd->file_pdf_id}"),

            'generated_at' => optional($gd->generated_at)->toISOString(),
        ]);
    }
}
