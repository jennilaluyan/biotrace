<?php

namespace App\Http\Controllers;

use App\Http\Requests\DocumentTemplateUploadRequest;
use App\Http\Requests\DocumentTemplateUpdateRequest;
use App\Models\FileBlob;
use App\Services\FileStoreService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class DocumentTemplateController extends Controller
{
    public function __construct(private readonly FileStoreService $files) {}

    private function assertAdminOrLabHeadOr403(Request $request): void
    {
        $u = $request->user();
        $roleId = (int) ($u?->role_id ?? 0);
        $roleName = strtolower((string) ($u?->role?->name ?? $u?->role_name ?? ''));

        $isAdmin =
            $roleId === 2 ||
            str_contains($roleName, 'administrator') ||
            $roleName === 'admin';

        $isLabHead =
            $roleId === 6 ||
            str_contains($roleName, 'lab head') ||
            $roleName === 'lh';

        if (!$u || (!$isAdmin && !$isLabHead)) {
            abort(403, 'Forbidden.');
        }
    }

    /**
     * GET /api/v1/document-templates
     */
    public function index(Request $request): JsonResponse
    {
        $this->assertAdminOrLabHeadOr403($request);

        $rows = DB::table('documents as d')
            ->leftJoin('document_versions as dv', 'dv.doc_ver_id', '=', 'd.version_current_id')
            ->where('d.kind', 'template')
            ->select([
                'd.doc_id',
                'd.doc_code',
                'd.title',
                'd.record_no_prefix',
                'd.form_code_prefix',
                'd.revision_no',
                'd.is_active',
                'd.version_current_id',
                'dv.version_no as current_version_no',
                'dv.file_id as current_file_id',
                'dv.created_at as version_uploaded_at',
            ])
            ->orderBy('d.doc_id')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * PATCH /api/v1/document-templates/{doc_code}
     */
    public function update(string $docCode, DocumentTemplateUpdateRequest $request): JsonResponse
    {
        $this->assertAdminOrLabHeadOr403($request);

        $doc = DB::table('documents')
            ->where('doc_code', $docCode)
            ->where('kind', 'template')
            ->first();

        if (!$doc) {
            return response()->json(['message' => 'Template not found'], 404);
        }

        $payload = array_filter($request->validated(), fn($v) => $v !== null);

        if (empty($payload)) {
            return response()->json(['message' => 'No changes'], 200);
        }

        DB::table('documents')
            ->where('doc_id', $doc->doc_id)
            ->update(array_merge($payload, ['updated_at' => now()]));

        return response()->json(['message' => 'Updated']);
    }

    /**
     * POST /api/v1/document-templates/{doc_code}/versions
     * multipart: file(docx)
     */
    public function uploadVersion(string $docCode, DocumentTemplateUploadRequest $request): JsonResponse
    {
        $this->assertAdminOrLabHeadOr403($request);

        $doc = DB::table('documents')
            ->where('doc_code', $docCode)
            ->where('kind', 'template')
            ->first();

        if (!$doc) {
            return response()->json(['message' => 'Template not found'], 404);
        }

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $request->file('file');

        $bytes = file_get_contents($file->getRealPath());
        if ($bytes === false) {
            return response()->json(['message' => 'Failed to read upload'], 422);
        }

        $u = $request->user();

        $uploadedBy = (int) ($u?->staff_id ?? 0);
        if ($uploadedBy <= 0) {
            $uploadedBy = (int) ($u?->id ?? 0);
        }
        if ($uploadedBy <= 0 && !empty($u?->email)) {
            $uploadedBy = (int) (DB::table('staffs')->where('email', $u->email)->value('staff_id') ?? 0);
        }
        if ($uploadedBy <= 0) {
            abort(422, 'Unable to resolve uploader staff_id for document_versions.uploaded_by');
        }

        $fileId = $this->files->storeBytes(
            $bytes,
            $file->getClientOriginalName(),
            $file->getMimeType(),
            'docx',
            $uploadedBy, // ✅ pakai uploadedBy
            true
        );

        // Determine next version number
        $next = (int) (DB::table('document_versions')->where('doc_id', $doc->doc_id)->max('version_no') ?? 0) + 1;

        $uploadedBy = (int) ($u?->staff_id ?? 0);
        if ($uploadedBy <= 0) {
            $uploadedBy = (int) ($u?->id ?? 0);
        }

        if ($uploadedBy <= 0 && !empty($u?->email)) {
            $uploadedBy = (int) (DB::table('staffs')->where('email', $u->email)->value('staff_id') ?? 0);
        }

        if ($uploadedBy <= 0) {
            abort(422, 'Unable to resolve uploader staff_id for document_versions.uploaded_by');
        }

        $docVerId = DB::table('document_versions')->insertGetId([
            'doc_id' => $doc->doc_id,
            'version_no' => $next,
            'file_id' => $fileId,
            'uploaded_by' => $uploadedBy,

            'changelog' => json_encode([[
                'at' => now()->toIso8601String(),
                'by' => $uploadedBy,
                'action' => 'UPLOAD_TEMPLATE',
                'note' => $file->getClientOriginalName(),
            ]]),

            'created_at' => now(),
            'updated_at' => now(),
        ], 'doc_ver_id');

        DB::table('documents')
            ->where('doc_id', $doc->doc_id)
            ->update([
                'version_current_id' => $docVerId,
                'updated_at' => now(),
            ]);

        return response()->json([
            'message' => 'Uploaded',
            'doc_code' => $docCode,
            'doc_id' => $doc->doc_id,
            'doc_ver_id' => $docVerId,
            'version_no' => $next,
            'file_id' => $fileId,
        ]);
    }
}