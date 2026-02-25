<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
use App\Services\CoaDocCodeAliasService;
use App\Services\FileStoreService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Eloquent\ModelNotFoundException;

class ReportDocumentsController extends Controller
{
    // Samakan dengan CoaDownloadController (Admin=2, OM=5, LH=6)
    private const COA_VIEWER_ROLE_IDS = [2, 5, 6];

    public function __construct(
        private readonly FileStoreService $files,
        private readonly ?CoaDocCodeAliasService $coaAlias = null,
    ) {}

    public function index(): JsonResponse
    {
        $docs = [];

        $sampleId = request()->query('sample_id');
        $sampleId = is_numeric($sampleId) ? (int) $sampleId : null;

        $user = Auth::user();
        $roleId = (int) ($user->role_id ?? 0);
        $canSeeCoa = $user && in_array($roleId, self::COA_VIEWER_ROLE_IDS, true);

        $getSampleIdsByLoId = function (int $loId): array {
            try {
                if (!Schema::hasTable('letter_of_order_items')) return [];
                return DB::table('letter_of_order_items')
                    ->where('lo_id', $loId)
                    ->pluck('sample_id')
                    ->filter(fn($x) => is_numeric($x))
                    ->map(fn($x) => (int) $x)
                    ->values()
                    ->all();
            } catch (\Throwable) {
                return [];
            }
        };

        // =========================
        // LOO (Letter of Order)
        // =========================
        $loos = LetterOfOrder::query()
            ->with(['items', 'sample.client'])
            ->orderByDesc('generated_at')
            ->limit(200)
            ->get();

        foreach ($loos as $lo) {
            $loId = (int) $lo->lo_id;

            $sampleIds = [];
            if ($lo->items) {
                foreach ($lo->items as $it) {
                    $sid = (int) ($it->sample_id ?? 0);
                    if ($sid > 0) $sampleIds[] = $sid;
                }
            }
            $sampleIds = array_values(array_unique(array_filter($sampleIds, fn($x) => $x > 0)));

            if ($sampleId && !in_array($sampleId, $sampleIds, true)) continue;

            $payload = is_array($lo->payload) ? $lo->payload : (array) $lo->payload;
            $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);

            $docName = 'Letter of Order (LOO)';
            $docCode = (string) $lo->number;

            // ✅ selalu lewat endpoint gate => baru stream
            $downloadUrl = url("/api/v1/reports/documents/loo/{$loId}/pdf");

            $docs[] = [
                'type' => 'LOO',
                'id' => $loId,
                'document_name' => $docName,
                'document_code' => $docCode,
                'number' => $docCode,
                'status' => (string) ($lo->loa_status ?? 'draft'),
                'generated_at' => $lo->generated_at?->toIso8601String(),
                'created_at' => $lo->created_at?->toIso8601String(),
                'sample_ids' => $sampleIds,
                'lo_id' => $loId,

                'file_url' => null,

                'record_no' => (string) ($payload['record_no'] ?? ''),
                'form_code' => (string) ($payload['form_code'] ?? ''),
                'pdf_file_id' => $pdfFileId,

                'download_url' => $downloadUrl,
            ];
        }

        // =========================
        // Reagent Request (approved) - DB only
        // =========================
        try {
            if (Schema::hasTable('reagent_requests') && Schema::hasTable('generated_documents')) {
                $rrQuery = DB::table('reagent_requests as rr')
                    ->leftJoin('letters_of_order as lo', 'lo.lo_id', '=', 'rr.lo_id')
                    ->leftJoin('generated_documents as gd', function ($j) {
                        $j->on('gd.entity_id', '=', 'rr.reagent_request_id')
                            ->where('gd.entity_type', '=', 'reagent_request')
                            ->where('gd.doc_code', '=', 'REAGENT_REQUEST')
                            ->where('gd.is_active', '=', 1);
                    })
                    ->select([
                        'rr.reagent_request_id',
                        'rr.lo_id',
                        'rr.status',
                        'rr.created_at',
                        'rr.updated_at',
                        'lo.number as loo_number',
                        'gd.file_pdf_id as pdf_file_id',
                        'gd.record_no as record_no',
                        'gd.form_code as form_code',
                    ])
                    ->where('rr.status', '=', 'approved')
                    ->whereNotNull('gd.file_pdf_id')
                    ->orderByDesc('rr.reagent_request_id')
                    ->limit(300);

                $rrs = $rrQuery->get();

                foreach ($rrs as $rr) {
                    $rrId = (int) ($rr->reagent_request_id ?? 0);
                    $loId = (int) ($rr->lo_id ?? 0);
                    if ($rrId <= 0) continue;

                    $sampleIds = $loId > 0 ? $getSampleIdsByLoId($loId) : [];
                    $sampleIds = array_values(array_unique(array_filter($sampleIds, fn($x) => $x > 0)));

                    if ($sampleId && !in_array($sampleId, $sampleIds, true)) continue;

                    $looNumber = $rr->loo_number ? (string) $rr->loo_number : null;
                    $pdfFileId = (int) ($rr->pdf_file_id ?? 0);

                    $downloadUrl = url("/api/v1/reports/documents/reagent-request/{$rrId}/pdf");

                    $docs[] = [
                        'type' => 'REAGENT_REQUEST',
                        'id' => $rrId,
                        'document_name' => 'Reagent Request',
                        'document_code' => $looNumber ? ('RR • ' . $looNumber) : ('RR #' . $rrId),
                        'number' => $looNumber ? ('RR • ' . $looNumber) : ('RR #' . $rrId),
                        'status' => (string) ($rr->status ?? 'approved'),
                        'generated_at' => $rr->updated_at ? (string) $rr->updated_at : null,
                        'created_at' => $rr->created_at ? (string) $rr->created_at : null,
                        'sample_ids' => $sampleIds,
                        'lo_id' => $loId,
                        'reagent_request_id' => $rrId,

                        'file_url' => null,

                        'record_no' => (string) ($rr->record_no ?? ''),
                        'form_code' => (string) ($rr->form_code ?? ''),
                        'pdf_file_id' => $pdfFileId,

                        'download_url' => $downloadUrl,
                    ];
                }
            }
        } catch (\Throwable) {
            // keep endpoint alive even if schema differs
        }

        // =========================
        // COA (locked reports) - DB only
        // =========================
        if (
            $canSeeCoa
            && Schema::hasTable('reports')
            && Schema::hasColumn('reports', 'sample_id')
            && Schema::hasColumn('reports', 'pdf_file_id')
        ) {
            $idCol = Schema::hasColumn('reports', 'report_id')
                ? 'report_id'
                : (Schema::hasColumn('reports', 'id') ? 'id' : null);

            if ($idCol) {
                $numberCol = Schema::hasColumn('reports', 'report_no')
                    ? 'report_no'
                    : (Schema::hasColumn('reports', 'number') ? 'number' : null);

                if ($numberCol) {
                    $q = DB::table('reports as r')
                        ->whereNotNull('r.pdf_file_id')
                        ->when(Schema::hasColumn('reports', 'is_locked'), fn($qq) => $qq->where('r.is_locked', '=', 1))
                        ->when(Schema::hasColumn('reports', 'report_type'), fn($qq) => $qq->where('r.report_type', '=', 'coa'))
                        ->when($sampleId, fn($qq) => $qq->where('r.sample_id', '=', $sampleId))
                        ->orderByDesc('r.' . $idCol)
                        ->limit(300);

                    $clientTypeAliasCol = null;
                    $workflowGroupCol = null;

                    $canJoinSamples = Schema::hasTable('samples') && Schema::hasColumn('samples', 'sample_id');
                    $canJoinClients = Schema::hasTable('clients');

                    // ✅ Guard: jangan join "samples as s" lebih dari sekali
                    $joinedSamples = false;
                    $ensureSamplesJoin = function () use (&$q, &$joinedSamples) {
                        if ($joinedSamples) return;
                        $q->leftJoin('samples as s', 's.sample_id', '=', 'r.sample_id');
                        $joinedSamples = true;
                    };

                    if ($canJoinSamples && Schema::hasColumn('samples', 'workflow_group')) {
                        $ensureSamplesJoin();
                        $workflowGroupCol = 's.workflow_group';
                    }

                    if ($canJoinSamples && $canJoinClients && Schema::hasColumn('samples', 'client_id')) {
                        $clientPk = Schema::hasColumn('clients', 'client_id')
                            ? 'client_id'
                            : (Schema::hasColumn('clients', 'id') ? 'id' : null);

                        $typeCol = null;
                        foreach (['client_type', 'type', 'kind', 'category'] as $cand) {
                            if (Schema::hasColumn('clients', $cand)) {
                                $typeCol = $cand;
                                break;
                            }
                        }

                        if ($clientPk && $typeCol) {
                            $ensureSamplesJoin();
                            $q->leftJoin('clients as c', 'c.' . $clientPk, '=', 's.client_id');
                            $clientTypeAliasCol = $typeCol;
                        }
                    }

                    $select = [
                        'r.' . $idCol . ' as report_id',
                        'r.sample_id',
                        'r.' . $numberCol . ' as report_no',
                        'r.created_at',
                        'r.pdf_file_id',
                    ];

                    if ($workflowGroupCol) $select[] = $workflowGroupCol . ' as workflow_group';
                    if ($clientTypeAliasCol) $select[] = 'c.' . $clientTypeAliasCol . ' as client_type';

                    $rows = $q->get($select);

                    foreach ($rows as $r) {
                        $rid = (int) ($r->report_id ?? 0);
                        $sid = (int) ($r->sample_id ?? 0);
                        if ($rid <= 0 || $sid <= 0) continue;

                        $no = (string) ($r->report_no ?? ('COA #' . $rid));
                        $pdfFileId = (int) ($r->pdf_file_id ?? 0);
                        if ($pdfFileId <= 0) continue;

                        // ✅ FIX: gunakan gate endpoint kita sendiri (bukan /reports/{id}/pdf)
                        $downloadUrl = url("/api/v1/reports/documents/coa/{$rid}/pdf");

                        $coaDocCode = $this->inferCoaDocCode($r, $no);
                        $coaName = $this->coaLabel($coaDocCode);

                        $docs[] = [
                            'type' => 'COA',
                            'id' => $rid,
                            'report_id' => $rid,
                            'document_name' => $coaName,
                            'document_code' => $no,
                            'number' => $no,
                            'status' => 'locked',
                            'generated_at' => null,
                            'created_at' => $r->created_at ? (string) $r->created_at : null,
                            'sample_ids' => [$sid],

                            'file_url' => null,

                            'pdf_file_id' => $pdfFileId,
                            'doc_code' => $coaDocCode,
                            'download_url' => $downloadUrl,
                        ];
                    }
                }
            }
        }

        usort($docs, function ($a, $b) {
            $ta = strtotime((string) ($a['generated_at'] ?? $a['created_at'] ?? '')) ?: 0;
            $tb = strtotime((string) ($b['generated_at'] ?? $b['created_at'] ?? '')) ?: 0;
            return $tb <=> $ta;
        });

        return response()->json(['data' => $docs]);
    }

    private function inferCoaDocCode(object $row, string $reportNo): string
    {
        $wf = strtolower((string) ($row->workflow_group ?? ''));
        $no = strtolower((string) $reportNo);
        $ct = strtolower((string) ($row->client_type ?? ''));

        if ($wf !== '') {
            if (str_contains($wf, 'wgs')) return 'COA_WGS';
            if (str_contains($wf, 'antigen')) return 'COA_ANTIGEN';
            if (str_contains($wf, 'group_19_22') || str_contains($wf, '19_22')) return 'COA_GROUP_19_22';
            if (str_contains($wf, 'group_23_32') || str_contains($wf, '23_32')) return 'COA_GROUP_23_32';
        }
        if ($no !== '' && (str_contains($no, '/adm/16/') || str_contains($no, 'wgs'))) return 'COA_WGS';

        if (
            $ct !== '' &&
            (str_contains($ct, 'instit') || str_contains($ct, 'org') || str_contains($ct, 'company') || str_contains($ct, 'inst'))
        ) {
            return 'COA_PCR_KERJASAMA';
        }

        return 'COA_PCR_MANDIRI';
    }

    private function coaLabel(string $docCode): string
    {
        if ($this->coaAlias) return $this->coaAlias->label($docCode);

        $dc = strtoupper(trim($docCode));
        return match ($dc) {
            'COA_WGS' => 'COA WGS',
            'COA_PCR_KERJASAMA' => 'COA PCR Kerja Sama',
            'COA_PCR_MANDIRI' => 'COA PCR Mandiri',
            'COA_ANTIGEN' => 'COA Antigen',
            'COA_GROUP_19_22' => 'COA Parameters 19–22',
            'COA_GROUP_23_32' => 'COA Parameters 23–32',
            default => 'COA',
        };
    }

    public function pdf(string $type, int $id)
    {
        $user = Auth::user();
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $type = strtolower(trim($type));

        // =========================
        // COA (stream existing PDF by file id)
        // =========================
        if ($type === 'coa') {
            $roleId = (int) ($user->role_id ?? 0);
            if (!in_array($roleId, self::COA_VIEWER_ROLE_IDS, true)) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }

            if (!Schema::hasTable('reports')) {
                return response()->json(['message' => 'Reports table not found.'], 500);
            }

            $idCol = Schema::hasColumn('reports', 'report_id')
                ? 'report_id'
                : (Schema::hasColumn('reports', 'id') ? 'id' : null);

            if (!$idCol || !Schema::hasColumn('reports', 'pdf_file_id')) {
                return response()->json(['message' => 'Reports schema not compatible.'], 500);
            }

            $q = DB::table('reports')->where($idCol, $id);

            // lock gate if exists (matches list behavior)
            if (Schema::hasColumn('reports', 'is_locked')) {
                $q->where('is_locked', '=', 1);
            }

            $r = $q->first(['pdf_file_id']);
            if (!$r) return response()->json(['message' => 'Document not found.'], 404);

            $pdfFileId = (int) ($r->pdf_file_id ?? 0);
            if ($pdfFileId <= 0) {
                return response()->json([
                    'message' => 'COA PDF not available (missing pdf_file_id).',
                    'code' => 'COA_PDF_NOT_AVAILABLE',
                    'report_id' => (int) $id,
                ], 422);
            }

            try {
                return $this->files->streamResponse($pdfFileId, false);
            } catch (ModelNotFoundException $e) {
                return response()->json(['message' => 'File not found.'], 404);
            }
        }

        // =========================
        // LOO
        // =========================
        if ($type === 'loo') {
            $lo = LetterOfOrder::query()->where('lo_id', $id)->first();
            if (!$lo) return response()->json(['message' => 'Document not found.'], 404);

            if (!Schema::hasTable('loo_sample_approvals')) {
                return response()->json(['message' => 'Approvals table not found.'], 500);
            }

            $payload = is_array($lo->payload) ? $lo->payload : (array) $lo->payload;

            $sampleIds = [];
            if (isset($payload['sample_ids']) && is_array($payload['sample_ids'])) {
                $sampleIds = array_values(array_unique(array_map('intval', $payload['sample_ids'])));
            } elseif (isset($payload['items']) && is_array($payload['items'])) {
                foreach ($payload['items'] as $it) {
                    $sid = (int) ($it['sample_id'] ?? 0);
                    if ($sid > 0) $sampleIds[] = $sid;
                }
                $sampleIds = array_values(array_unique($sampleIds));
            }

            $sampleIds = array_values(array_filter($sampleIds, fn($x) => $x > 0));
            if (!$sampleIds) {
                return response()->json(['message' => 'LOO payload missing sample ids.'], 422);
            }

            $rows = DB::table('loo_sample_approvals')
                ->whereIn('sample_id', $sampleIds)
                ->whereIn('role_code', ['OM', 'LH'])
                ->whereNotNull('approved_at')
                ->get(['sample_id', 'role_code']);

            $seen = [];
            foreach ($rows as $r) {
                $sid = (int) $r->sample_id;
                $rc = strtoupper((string) $r->role_code);
                if (!isset($seen[$sid])) $seen[$sid] = ['OM' => false, 'LH' => false];
                if ($rc === 'OM' || $rc === 'LH') $seen[$sid][$rc] = true;
            }

            $hasReady = false;
            foreach ($seen as $st) {
                if (!empty($st['OM']) && !empty($st['LH'])) {
                    $hasReady = true;
                    break;
                }
            }

            if (!$hasReady) {
                return response()->json(['message' => 'LOO cannot be viewed: no Ready sample (OM+LH approved).'], 422);
            }

            $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);
            if ($pdfFileId > 0) {
                try {
                    return $this->files->streamResponse($pdfFileId, false);
                } catch (ModelNotFoundException $e) {
                    return response()->json(['message' => 'File not found.'], 404);
                }
            }

            return response()->json([
                'message' => 'LOO PDF not available (missing pdf_file_id). Regenerate/backfill required.',
                'code' => 'LOO_PDF_NOT_AVAILABLE',
                'lo_id' => (int) $lo->lo_id,
            ], 422);
        }

        // =========================
        // REAGENT REQUEST (DB only)
        // =========================
        if (in_array($type, ['reagent-request', 'reagent_request', 'rr'], true)) {
            if (!Schema::hasTable('reagent_requests')) {
                return response()->json(['message' => 'Reagent requests table not found.'], 500);
            }

            $rr = DB::table('reagent_requests')->where('reagent_request_id', $id)->first();
            if (!$rr) return response()->json(['message' => 'Document not found.'], 404);

            $st = strtolower(trim((string) ($rr->status ?? '')));
            if ($st !== 'approved') {
                return response()->json(['message' => 'Reagent Request is not approved.'], 422);
            }

            if (Schema::hasTable('generated_documents')) {
                $gd = DB::table('generated_documents')
                    ->where('doc_code', 'REAGENT_REQUEST')
                    ->where('entity_type', 'reagent_request')
                    ->where('entity_id', $id)
                    ->where('is_active', 1)
                    ->orderByDesc('gen_doc_id')
                    ->first(['file_pdf_id']);

                $pdfFileId = (int) ($gd->file_pdf_id ?? 0);
                if ($pdfFileId > 0) {
                    try {
                        return $this->files->streamResponse($pdfFileId, false);
                    } catch (ModelNotFoundException $e) {
                        return response()->json(['message' => 'File not found.'], 404);
                    }
                }
            }

            return response()->json([
                'message' => 'Reagent Request PDF not available yet. Generate it first (POST /api/v1/reagent-requests/{id}/generate-pdf).',
                'code' => 'RR_PDF_NOT_AVAILABLE',
                'reagent_request_id' => (int) $id,
            ], 422);
        }

        return response()->json(['message' => 'Unsupported document type.'], 400);
    }

    private function streamPdfByFileId(int $fileId, string $fallbackName)
    {
        try {
            return $this->files->streamResponse($fileId, false);
        } catch (\Exception $e) {
            return response()->json(['message' => 'File not found.'], 404);
        }
    }
}
