<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use App\Services\AuditEventService;
use App\Services\FileStoreService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class FileController extends Controller
{
    public function __construct(
        private readonly FileStoreService $files,
        private readonly AuditEventService $audit,
    ) {}

    /**
     * GET /api/v1/files/{fileId}?download=1
     *
     * Streams a file if the authenticated user is allowed to access it.
     * Access is determined by checking which domain entity references the file.
     * All access attempts are audit-logged (allowed + denied).
     */
    public function show(Request $request, int $fileId)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $actorId = (int) ($user->staff_id ?? $user->id ?? 0);

        [$allowed, $status, $message, $ctx] = $this->checkAccess($user, $fileId);

        if (!$allowed) {
            $this->audit->log(
                AuditEventService::DOC_ACCESS_DENIED,
                array_merge(['file_id' => $fileId], $ctx),
                'file',
                $fileId,
                $actorId
            );

            return response()->json(['message' => $message], $status);
        }

        $download = $request->boolean('download', false);

        $this->audit->log(
            AuditEventService::DOC_DOWNLOADED,
            array_merge(['file_id' => $fileId, 'download' => $download], $ctx),
            'file',
            $fileId,
            $actorId
        );

        return $this->files->streamResponse($fileId, $download);
    }

    /**
     * Return tuple: [allowed(bool), httpStatus(int), message(string), ctx(array)]
     */
    private function checkAccess(object $user, int $fileId): array
    {
        /** @var Staff|null $staff */
        $staff = $user instanceof Staff ? $user : null;

        $roleName = strtolower((string) ($user?->role?->name ?? $user?->role_name ?? ''));
        $roleId = (int) ($user?->role_id ?? 0);

        $isAdmin =
            in_array($roleId, [1, 2], true) ||
            str_contains($roleName, 'administrator') ||
            str_contains($roleName, 'admin') ||
            $roleName === 'system role';

        $isLabHead =
            $roleId === 6 ||
            $roleName === 'lh' ||
            str_contains($roleName, 'lab head') ||
            str_contains($roleName, 'laboratory head');

        $isOm =
            $roleId === 5 ||
            $roleName === 'om' ||
            str_contains($roleName, 'operational manager');

        $canSeeCoa = $isAdmin || $isLabHead || $isOm;

        /**
         * 1) TEMPLATE FILES: document_versions.file_id
         * Restricted to Admin/LH.
         */
        if (Schema::hasTable('document_versions') && Schema::hasColumn('document_versions', 'file_id')) {
            $isTemplate = DB::table('document_versions')->where('file_id', $fileId)->exists();
            if ($isTemplate) {
                if ($isAdmin || $isLabHead) {
                    return [true, 200, 'OK', ['kind' => 'template']];
                }
                return [false, 403, 'Forbidden (template files are restricted to Admin/LH).', ['kind' => 'template']];
            }
        }

        /**
         * 1b) QUALITY COVER SUPPORTING FILES
         * Only staff can access.
         * - Draft: visible only to owner (checked_by / uploaded_by) and Admin
         * - Submitted+: visible to owner and reviewer roles (Admin/OM/LH)
         */
        if (
            Schema::hasTable('quality_cover_supporting_files') &&
            Schema::hasTable('quality_covers') &&
            Schema::hasColumn('quality_cover_supporting_files', 'file_id') &&
            Schema::hasColumn('quality_cover_supporting_files', 'quality_cover_id')
        ) {
            $qcRow = DB::table('quality_cover_supporting_files as qcsf')
                ->join('quality_covers as qc', 'qc.quality_cover_id', '=', 'qcsf.quality_cover_id')
                ->where('qcsf.file_id', (int) $fileId)
                ->select([
                    'qc.quality_cover_id',
                    'qc.sample_id',
                    'qc.status',
                    'qc.checked_by_staff_id',
                    'qcsf.created_by_staff_id',
                ])
                ->first();

            if ($qcRow) {
                if (!$staff) {
                    return [
                        false,
                        403,
                        'Forbidden (quality cover supporting documents require staff access).',
                        [
                            'kind' => 'quality_cover_supporting_file',
                            'reason' => 'requires_staff',
                            'quality_cover_id' => (int) $qcRow->quality_cover_id,
                            'sample_id' => (int) $qcRow->sample_id,
                        ],
                    ];
                }

                $staffId = (int) $staff->staff_id;
                $status = strtolower((string) ($qcRow->status ?? 'draft'));

                $isOwner =
                    ((int) ($qcRow->checked_by_staff_id ?? 0) === $staffId) ||
                    ((int) ($qcRow->created_by_staff_id ?? 0) === $staffId);

                $isReviewer = $isAdmin || $isOm || $isLabHead;

                $allowed = $status === 'draft'
                    ? ($isOwner || $isAdmin)
                    : ($isOwner || $isReviewer);

                if ($allowed) {
                    return [
                        true,
                        200,
                        'OK',
                        [
                            'kind' => 'quality_cover_supporting_file',
                            'quality_cover_id' => (int) $qcRow->quality_cover_id,
                            'sample_id' => (int) $qcRow->sample_id,
                            'qc_status' => (string) ($qcRow->status ?? ''),
                        ],
                    ];
                }

                return [
                    false,
                    403,
                    'Forbidden (you are not allowed to access this quality cover supporting document).',
                    [
                        'kind' => 'quality_cover_supporting_file',
                        'reason' => 'forbidden',
                        'quality_cover_id' => (int) $qcRow->quality_cover_id,
                        'sample_id' => (int) $qcRow->sample_id,
                        'qc_status' => (string) ($qcRow->status ?? ''),
                        'role_id' => $roleId,
                        'role_name' => $roleName,
                    ],
                ];
            }
        }

        /**
         * 2) GENERATED DOCUMENTS: generated_documents.file_pdf_id / file_docx_id
         */
        if (Schema::hasTable('generated_documents')) {
            $hasPdf = Schema::hasColumn('generated_documents', 'file_pdf_id');
            $hasDocx = Schema::hasColumn('generated_documents', 'file_docx_id');

            if ($hasPdf || $hasDocx) {
                $gd = DB::table('generated_documents')
                    ->where(function ($q) use ($fileId, $hasPdf, $hasDocx) {
                        if ($hasPdf) $q->orWhere('file_pdf_id', '=', $fileId);
                        if ($hasDocx) $q->orWhere('file_docx_id', '=', $fileId);
                    })
                    ->orderByDesc('gen_doc_id')
                    ->first();

                if ($gd) {
                    $entityType = strtolower((string) ($gd->entity_type ?? ''));
                    $entityId = (int) ($gd->entity_id ?? 0);
                    $docCode = (string) ($gd->doc_code ?? '');

                    // 2a) COA/REPORT => require COA viewer roles (Admin/OM/LH)
                    if ($entityType === 'report') {
                        if ($canSeeCoa) {
                            return [true, 200, 'OK', [
                                'kind' => 'generated',
                                'entity' => 'report',
                                'entity_id' => $entityId,
                                'doc_code' => $docCode,
                            ]];
                        }
                        return [false, 403, 'Forbidden (COA access restricted).', [
                            'kind' => 'generated',
                            'entity' => 'report',
                            'entity_id' => $entityId,
                            'doc_code' => $docCode,
                        ]];
                    }

                    // 2b) LOO => must have at least ONE Ready sample (OM+LH approved)
                    if ($entityType === 'loo') {
                        $ok = $this->looHasAnyReadySample($entityId);
                        if ($ok) {
                            return [true, 200, 'OK', [
                                'kind' => 'generated',
                                'entity' => 'loo',
                                'entity_id' => $entityId,
                                'doc_code' => $docCode,
                            ]];
                        }
                        return [false, 422, 'LOO cannot be viewed: no Ready sample (OM+LH approved).', [
                            'kind' => 'generated',
                            'entity' => 'loo',
                            'entity_id' => $entityId,
                            'doc_code' => $docCode,
                        ]];
                    }

                    // 2c) REAGENT REQUEST => must be approved
                    if ($entityType === 'reagent_request') {
                        $approved = $this->reagentRequestIsApproved($entityId);
                        if ($approved) {
                            return [true, 200, 'OK', [
                                'kind' => 'generated',
                                'entity' => 'reagent_request',
                                'entity_id' => $entityId,
                                'doc_code' => $docCode,
                            ]];
                        }
                        return [false, 422, 'Reagent Request is not approved.', [
                            'kind' => 'generated',
                            'entity' => 'reagent_request',
                            'entity_id' => $entityId,
                            'doc_code' => $docCode,
                        ]];
                    }

                    // Unknown generated doc type => Admin/LH only
                    if ($isAdmin || $isLabHead) {
                        return [true, 200, 'OK', [
                            'kind' => 'generated',
                            'entity' => $entityType,
                            'entity_id' => $entityId,
                            'doc_code' => $docCode,
                        ]];
                    }

                    return [false, 403, 'Forbidden.', [
                        'kind' => 'generated',
                        'entity' => $entityType,
                        'entity_id' => $entityId,
                        'doc_code' => $docCode,
                    ]];
                }
            }
        }

        /**
         * 3) REPORTS DIRECT LINK: reports.pdf_file_id => require COA viewer roles
         */
        if (Schema::hasTable('reports') && Schema::hasColumn('reports', 'pdf_file_id')) {
            $rid = DB::table('reports')->where('pdf_file_id', $fileId)->value('report_id');
            if ($rid) {
                if ($canSeeCoa) {
                    return [true, 200, 'OK', ['kind' => 'report_pdf', 'report_id' => (int) $rid]];
                }
                return [false, 403, 'Forbidden (COA access restricted).', ['kind' => 'report_pdf', 'report_id' => (int) $rid]];
            }
        }

        /**
         * If file not referenced anywhere, treat as not found (safer than leaking).
         */
        return [false, 404, 'File not found.', ['kind' => 'unknown']];
    }

    private function looHasAnyReadySample(int $loId): bool
    {
        if ($loId <= 0) return false;
        if (!Schema::hasTable('loo_sample_approvals')) return false;

        $sampleIds = [];

        try {
            if (Schema::hasTable('letter_of_order_items')) {
                $sampleIds = DB::table('letter_of_order_items')
                    ->where('lo_id', $loId)
                    ->pluck('sample_id')
                    ->filter(fn($x) => is_numeric($x))
                    ->map(fn($x) => (int) $x)
                    ->values()
                    ->all();
            }
        } catch (\Throwable) {
            $sampleIds = [];
        }

        $sampleIds = array_values(array_unique(array_filter($sampleIds, fn($x) => $x > 0)));
        if (!$sampleIds) return false;

        $rows = DB::table('loo_sample_approvals')
            ->whereIn('sample_id', $sampleIds)
            ->whereIn('role_code', ['OM', 'LH'])
            ->whereNotNull('approved_at')
            ->get(['sample_id', 'role_code']);

        $seen = [];
        foreach ($rows as $r) {
            $sid = (int) ($r->sample_id ?? 0);
            $rc = strtoupper((string) ($r->role_code ?? ''));
            if ($sid <= 0) continue;
            if (!isset($seen[$sid])) $seen[$sid] = ['OM' => false, 'LH' => false];
            if ($rc === 'OM' || $rc === 'LH') $seen[$sid][$rc] = true;
        }

        foreach ($seen as $st) {
            if (!empty($st['OM']) && !empty($st['LH'])) return true;
        }

        return false;
    }

    private function reagentRequestIsApproved(int $rrId): bool
    {
        if ($rrId <= 0) return false;
        if (!Schema::hasTable('reagent_requests')) return false;

        try {
            $st = DB::table('reagent_requests')->where('reagent_request_id', $rrId)->value('status');
            return strtolower(trim((string) $st)) === 'approved';
        } catch (\Throwable) {
            return false;
        }
    }
}
