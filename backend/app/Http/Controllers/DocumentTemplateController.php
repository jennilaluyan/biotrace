<?php

namespace App\Http\Controllers;

use App\Http\Requests\DocumentTemplateUploadRequest;
use App\Http\Requests\DocumentTemplateUpdateRequest;
use App\Services\AuditEventService;
use App\Services\FileStoreService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DocumentTemplateController extends Controller
{
    public function __construct(
        private readonly FileStoreService $files,
        // nullable: controller tetap aman kalau service belum ke-bind di env tertentu
        private readonly ?AuditEventService $audit = null,
    ) {}

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
            $roleName === 'lh' ||
            str_contains($roleName, 'laboratory head');

        if (!$u || (!$isAdmin && !$isLabHead)) {
            abort(403, 'Forbidden.');
        }
    }

    private function resolveUploaderStaffId(Request $request): int
    {
        $u = $request->user();

        $uploadedBy = (int) ($u?->staff_id ?? 0);
        if ($uploadedBy > 0) return $uploadedBy;

        $uploadedBy = (int) ($u?->id ?? 0);
        if ($uploadedBy > 0) return $uploadedBy;

        $email = (string) ($u?->email ?? '');
        if ($email !== '') {
            $sid = (int) (DB::table('staffs')->where('email', $email)->value('staff_id') ?? 0);
            if ($sid > 0) return $sid;
        }

        return 0;
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

        $changedKeys = array_keys($payload);

        DB::table('documents')
            ->where('doc_id', $doc->doc_id)
            ->update(array_merge($payload, ['updated_at' => now()]));

        // ✅ Step 20: audit log (meta update)
        try {
            if ($this->audit) {
                $actorId = $this->resolveUploaderStaffId($request);
                $this->audit->log(
                    AuditEventService::DOC_TEMPLATE_UPDATE_META,
                    [
                        'doc_code' => $docCode,
                        'doc_id' => (int) $doc->doc_id,
                        'changed' => $changedKeys,
                    ],
                    'document_template',
                    (int) $doc->doc_id,
                    $actorId > 0 ? $actorId : null
                );
            }
        } catch (\Throwable) {
            // never block main flow
        }

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

        $bytes = @file_get_contents($file->getRealPath());
        if ($bytes === false || $bytes === null || $bytes === '') {
            return response()->json(['message' => 'Failed to read upload'], 422);
        }

        $uploadedBy = $this->resolveUploaderStaffId($request);
        if ($uploadedBy <= 0) {
            abort(422, 'Unable to resolve uploader staff_id for document_versions.uploaded_by');
        }

        $originalName = (string) $file->getClientOriginalName();

        // ext paling reliable dari nama file (mime browser kadang ngaco)
        $ext = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $ext = ltrim($ext, '.');

        $docCodeUpper = strtoupper(trim($docCode));
        $isCoa = str_starts_with($docCodeUpper, 'COA_');

        // Enforce per doc_code:
        // - COA_* => XLSX
        // - lainnya => DOCX
        if ($isCoa) {
            if ($ext !== 'xlsx') {
                return response()->json(['message' => 'COA templates must be uploaded as .xlsx'], 422);
            }
        } else {
            if ($ext !== 'docx') {
                return response()->json(['message' => 'This template must be uploaded as .docx'], 422);
            }
        }

        // mime: tentukan dari ext (lebih stabil)
        $mime = match ($ext) {
            'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            default => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };

        // store file bytes (dedupe on)
        $fileId = $this->files->storeBytes(
            $bytes,
            $originalName,
            $mime,
            $ext,
            $uploadedBy,
            true
        );

        $now = now();

        $out = DB::transaction(function () use ($doc, $docCode, $fileId, $uploadedBy, $originalName, $now) {
            // Determine next version number
            $next = (int) (DB::table('document_versions')->where('doc_id', $doc->doc_id)->max('version_no') ?? 0) + 1;

            $docVerId = DB::table('document_versions')->insertGetId([
                'doc_id' => $doc->doc_id,
                'version_no' => $next,
                'file_id' => $fileId,
                'uploaded_by' => $uploadedBy,

                // keep simple changelog
                'changelog' => json_encode([[
                    'at' => $now->toIso8601String(),
                    'by' => $uploadedBy,
                    'action' => 'UPLOAD_TEMPLATE',
                    'note' => $originalName,
                ]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),

                'created_at' => $now,
                'updated_at' => $now,
            ], 'doc_ver_id');

            DB::table('documents')
                ->where('doc_id', $doc->doc_id)
                ->update([
                    'version_current_id' => $docVerId,
                    'updated_at' => $now,
                ]);

            return [
                'doc_ver_id' => (int) $docVerId,
                'version_no' => (int) $next,
            ];
        });

        // ✅ Step 20: audit log (upload template)
        try {
            if ($this->audit) {
                $this->audit->log(
                    AuditEventService::DOC_TEMPLATE_UPLOAD,
                    [
                        'doc_code' => $docCode,
                        'doc_id' => (int) $doc->doc_id,
                        'doc_ver_id' => (int) $out['doc_ver_id'],
                        'version_no' => (int) $out['version_no'],
                        'file_id' => (int) $fileId,
                        'original_name' => $originalName,
                        'mime_type' => $mime,
                        'revision_no' => (string) ($doc->revision_no ?? ''),
                        'record_no_prefix' => (string) ($doc->record_no_prefix ?? ''),
                        'form_code_prefix' => (string) ($doc->form_code_prefix ?? ''),
                    ],
                    'document_template',
                    (int) $doc->doc_id,
                    $uploadedBy
                );
            }
        } catch (\Throwable) {
            // never block main flow
        }

        return response()->json([
            'message' => 'Uploaded',
            'doc_code' => $docCode,
            'doc_id' => (int) $doc->doc_id,
            'doc_ver_id' => (int) $out['doc_ver_id'],
            'version_no' => (int) $out['version_no'],
            'file_id' => (int) $fileId,
        ]);
    }
}
