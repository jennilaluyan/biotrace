<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
use App\Services\FileStoreService;
use App\Services\ReagentRequestDocumentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ReportDocumentsController extends Controller
{
    private const COA_VIEWER_ROLE_IDS = [1, 5, 6];

    public function __construct(
        private readonly FileStoreService $files,
        // nullable so controller won't crash if service not registered yet in some env
        private readonly ?ReagentRequestDocumentService $rrDocs = null,
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

            $downloadUrl = $pdfFileId > 0
                ? url("/api/v1/files/{$pdfFileId}")
                : url("/api/v1/reports/documents/loo/{$loId}/pdf");

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

                // legacy compatibility fields
                'file_url' => $pdfFileId > 0 ? null : $lo->file_url,

                // new fields (optional; FE may ignore safely)
                'record_no' => (string) ($payload['record_no'] ?? ''),
                'form_code' => (string) ($payload['form_code'] ?? ''),
                'pdf_file_id' => $pdfFileId,

                'download_url' => $downloadUrl,
            ];
        }

        // =========================
        // Reagent Request (approved)
        // =========================
        try {
            if (Schema::hasTable('reagent_requests')) {
                $hasGenDocs = Schema::hasTable('generated_documents');

                $rrQuery = DB::table('reagent_requests as rr')
                    ->leftJoin('letters_of_order as lo', 'lo.lo_id', '=', 'rr.lo_id');

                if ($hasGenDocs) {
                    $rrQuery->leftJoin('generated_documents as gd', function ($j) {
                        $j->on('gd.entity_id', '=', 'rr.reagent_request_id')
                            ->where('gd.entity_type', '=', 'reagent_request')
                            ->where('gd.doc_code', '=', 'REAGENT_REQUEST')
                            ->where('gd.is_active', '=', 1);
                    });
                }

                $rrQuery
                    ->select(array_filter([
                        'rr.reagent_request_id',
                        'rr.lo_id',
                        'rr.status',
                        'rr.file_url',
                        'rr.created_at',
                        'rr.updated_at',
                        'lo.number as loo_number',

                        $hasGenDocs ? 'gd.file_pdf_id as pdf_file_id' : null,
                        $hasGenDocs ? 'gd.record_no as record_no' : null,
                        $hasGenDocs ? 'gd.form_code as form_code' : null,
                    ]))
                    ->where('rr.status', '=', 'approved')
                    ->where(function ($q) use ($hasGenDocs) {
                        if ($hasGenDocs) $q->whereNotNull('gd.file_pdf_id');
                        $q->orWhereNotNull('rr.file_url'); // legacy
                    })
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
                    $downloadUrl = $pdfFileId > 0
                        ? url("/api/v1/files/{$pdfFileId}")
                        : url("/api/v1/reports/documents/reagent-request/{$rrId}/pdf");

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

                        // legacy compatibility
                        'file_url' => $pdfFileId > 0 ? null : (string) ($rr->file_url ?? null),

                        // new optional metadata
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
        // COA (locked reports)
        // =========================
        if ($canSeeCoa && Schema::hasTable('reports') && Schema::hasColumn('reports', 'sample_id')) {
            $idCol = Schema::hasColumn('reports', 'report_id')
                ? 'report_id'
                : (Schema::hasColumn('reports', 'id') ? 'id' : null);

            if ($idCol) {
                $numberCol = Schema::hasColumn('reports', 'report_no')
                    ? 'report_no'
                    : (Schema::hasColumn('reports', 'number') ? 'number' : null);

                $hasPdfFileId = Schema::hasColumn('reports', 'pdf_file_id');

                $pdfCol = Schema::hasColumn('reports', 'pdf_url')
                    ? 'pdf_url'
                    : (Schema::hasColumn('reports', 'file_url') ? 'file_url' : null);

                if ($numberCol && ($pdfCol || $hasPdfFileId)) {
                    $q = DB::table('reports')
                        ->when($hasPdfFileId, fn($qq) => $qq->whereNotNull('pdf_file_id'))
                        ->when(!$hasPdfFileId && $pdfCol, fn($qq) => $qq->whereNotNull($pdfCol))
                        ->when(Schema::hasColumn('reports', 'is_locked'), fn($qq) => $qq->where('is_locked', '=', 1))
                        ->when(Schema::hasColumn('reports', 'report_type'), fn($qq) => $qq->where('report_type', '=', 'coa'))
                        ->when($sampleId, fn($qq) => $qq->where('sample_id', '=', $sampleId))
                        ->orderByDesc($idCol)
                        ->limit(300);

                    $select = [
                        $idCol . ' as report_id',
                        'sample_id',
                        $numberCol . ' as report_no',
                        'created_at',
                    ];

                    if ($hasPdfFileId) $select[] = 'pdf_file_id';
                    if ($pdfCol) $select[] = $pdfCol . ' as pdf_url';

                    $rows = $q->get($select);

                    foreach ($rows as $r) {
                        $rid = (int) ($r->report_id ?? 0);
                        $sid = (int) ($r->sample_id ?? 0);
                        if ($rid <= 0 || $sid <= 0) continue;

                        $no = (string) ($r->report_no ?? ('COA #' . $rid));
                        $pdfFileId = (int) ($r->pdf_file_id ?? 0);

                        $downloadUrl = $pdfFileId > 0
                            ? url("/api/v1/files/{$pdfFileId}")
                            : url("/api/v1/reports/{$rid}/pdf");

                        $docs[] = [
                            'type' => 'COA',
                            'id' => $rid,
                            'report_id' => $rid,
                            'document_name' => 'Certificate of Analysis (CoA)',
                            'document_code' => $no,
                            'number' => $no,
                            'status' => 'locked',
                            'generated_at' => null,
                            'created_at' => $r->created_at ? (string) $r->created_at : null,
                            'sample_ids' => [$sid],

                            // legacy compat
                            'file_url' => isset($r->pdf_url) && $r->pdf_url ? (string) $r->pdf_url : null,

                            // new
                            'pdf_file_id' => $pdfFileId,

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

    public function pdf(string $type, int $id)
    {
        $user = Auth::user();
        if (!$user) return response()->json(['message' => 'Unauthenticated.'], 401);

        $type = strtolower(trim($type));

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

            // Gate: at least ONE sample is Ready (OM+LH approved)
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

            // ✅ Step 12 DB-backed
            $pdfFileId = (int) ($payload['pdf_file_id'] ?? 0);
            if ($pdfFileId > 0) {
                return redirect()->to(url("/api/v1/files/{$pdfFileId}"));
            }

            // Legacy fallback (disk-based)
            $raw = $lo->file_url ? trim((string) $lo->file_url) : '';
            if ($raw === '') return response()->json(['message' => 'PDF file path is missing.'], 404);

            $abs = $this->resolvePdfAbsolutePath($raw);
            if (!$abs || !is_file($abs)) {
                return response()->json(['message' => 'PDF file not found on disk.'], 404);
            }

            return response()->file($abs, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . basename($abs) . '"',
            ]);
        }

        // =========================
        // REAGENT REQUEST
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

            // ✅ Step 13 prefer generated_documents -> files
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
                    return redirect()->to(url("/api/v1/files/{$pdfFileId}"));
                }
            }

            // Optional: try on-demand generate (if service exists + bound)
            try {
                if ($this->rrDocs) {
                    $actorStaffId = (int) ($user->staff_id ?? $user->id ?? 0);
                    if ($actorStaffId > 0) {
                        $gd2 = $this->rrDocs->generateApprovedPdf($id, $actorStaffId, false);
                        $pdfFileId2 = (int) ($gd2->file_pdf_id ?? 0);
                        if ($pdfFileId2 > 0) {
                            return redirect()->to(url("/api/v1/files/{$pdfFileId2}"));
                        }
                    }
                }
            } catch (\Throwable) {
                // ignore and fallback to legacy disk below
            }

            // Legacy fallback (disk-based)
            $raw = isset($rr->file_url) ? trim((string) $rr->file_url) : '';
            if ($raw === '') return response()->json(['message' => 'PDF file path is missing.'], 404);

            $abs = $this->resolvePdfAbsolutePath($raw);
            if (!$abs || !is_file($abs)) {
                return response()->json(['message' => 'PDF file not found on disk.'], 404);
            }

            return response()->file($abs, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . basename($abs) . '"',
            ]);
        }

        return response()->json(['message' => 'Unsupported document type.'], 400);
    }

    private function resolvePdfAbsolutePath(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') return null;

        $raw = str_replace('\\', '/', $raw);

        if (preg_match('/^https?:\/\//i', $raw)) {
            $p = parse_url($raw, PHP_URL_PATH);
            if (is_string($p) && $p !== '') $raw = $p;
        }

        $rel = ltrim($raw, '/');

        $candidates = [];

        if (strpos($raw, '/storage/') !== false) {
            $after = substr($raw, strpos($raw, '/storage/') + strlen('/storage/'));
            if (is_string($after) && $after !== '') $candidates[] = $after;
        }

        if ($rel !== '') $candidates[] = $rel;

        $candidates[] = preg_replace('#^storage/#', '', $rel);
        $candidates[] = preg_replace('#^public/#', '', $rel);

        foreach ($candidates as $c) {
            $c = (string) $c;
            if (str_starts_with($c, 'letters/loo/')) {
                $candidates[] = preg_replace('#^letters/loo/#', 'reports/loo/', $c);
            }
        }

        foreach ($candidates as $c) {
            $c = (string) $c;
            if (str_starts_with($c, 'letters/reagent_requests/')) {
                $candidates[] = preg_replace('#^letters/reagent_requests/#', 'reports/reagent_requests/', $c);
            }
            if (str_starts_with($c, 'letters/reagent_request/')) {
                $candidates[] = preg_replace('#^letters/reagent_request/#', 'reports/reagent_request/', $c);
            }
        }

        $candidates = array_values(array_unique(array_filter($candidates, fn($v) => is_string($v) && trim($v) !== '')));

        $withPrivatePrefix = [];
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;
            $withPrivatePrefix[] = $c;
            if (!str_starts_with($c, 'private/')) $withPrivatePrefix[] = 'private/' . $c;
        }
        $withPrivatePrefix = array_values(array_unique($withPrivatePrefix));

        $diskLocal = Storage::disk('local');
        foreach ($withPrivatePrefix as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;
            if ($diskLocal->exists($c)) return $diskLocal->path($c);
        }

        $diskPublic = Storage::disk('public');
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;
            if ($diskPublic->exists($c)) return $diskPublic->path($c);
        }

        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            $pPrivate = storage_path('app/private/' . $c);
            if (is_file($pPrivate)) return $pPrivate;

            if (str_starts_with($c, 'private/')) {
                $pPrivate2 = storage_path('app/' . $c);
                if (is_file($pPrivate2)) return $pPrivate2;
            }

            $pPublic = storage_path('app/public/' . $c);
            if (is_file($pPublic)) return $pPublic;

            $pPublicLink = public_path('storage/' . $c);
            if (is_file($pPublicLink)) return $pPublicLink;
        }

        $filename = basename($rel);
        if ($filename) {
            $roots = [
                storage_path('app/private/reports/loo'),
                storage_path('app/private/letters/loo'),
                storage_path('app/private/reports/reagent_requests'),
                storage_path('app/private/reports/reagent_request'),
                storage_path('app/private/letters/reagent_requests'),
                storage_path('app/private/letters/reagent_request'),
                storage_path('app/private/reports'),
                storage_path('app/private/letters'),
            ];

            foreach ($roots as $root) {
                if (!is_dir($root)) continue;
                $found = $this->findFileByName($root, $filename, 6);
                if ($found) return $found;
            }
        }

        return null;
    }

    private function findFileByName(string $dir, string $filename, int $maxDepth = 3): ?string
    {
        $dir = rtrim($dir, DIRECTORY_SEPARATOR);
        if (!is_dir($dir)) return null;

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if ($iterator->getDepth() > $maxDepth) continue;
            if ($file->isFile() && $file->getFilename() === $filename) return $file->getPathname();
        }

        return null;
    }
}
