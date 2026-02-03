<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ReportDocumentsController extends Controller
{
    /**
     * GET /v1/reports/documents
     * Central repository for downloadable documents (LOO now, extensible later).
     *
     * Optional query:
     * - sample_id: int (filter docs that relate to a sample)
     */
    public function index(): JsonResponse
    {
        $docs = [];

        $sampleId = request()->query('sample_id');
        $sampleId = is_numeric($sampleId) ? (int) $sampleId : null;

        // helper: get sample_ids by lo_id (for filtering / FE usage)
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

        // -----------------------------
        // 1) LOO documents
        // -----------------------------
        $loos = LetterOfOrder::query()
            ->with([
                'items',
                'sample.client',
            ])
            ->orderByDesc('generated_at')
            ->limit(200)
            ->get();

        foreach ($loos as $lo) {
            $loId = (int) $lo->lo_id;

            // build sample_ids (prefer items sample_id)
            $sampleIds = [];
            if ($lo->items) {
                foreach ($lo->items as $it) {
                    $sid = (int) ($it->sample_id ?? 0);
                    if ($sid > 0) $sampleIds[] = $sid;
                }
            }
            $sampleIds = array_values(array_unique(array_filter($sampleIds, fn($x) => $x > 0)));

            // optional filter by sample_id
            if ($sampleId && !in_array($sampleId, $sampleIds, true)) {
                continue;
            }

            $docName = 'Letter of Order (LOO)';
            $docCode = (string) $lo->number;

            $docs[] = [
                'type' => 'LOO',
                'id' => $loId,

                // doc-centric fields
                'document_name' => $docName,
                'document_code' => $docCode,

                // keep number for compatibility
                'number' => $docCode,

                'status' => (string) ($lo->loa_status ?? 'draft'),
                'generated_at' => $lo->generated_at?->toIso8601String(),
                'created_at' => $lo->created_at?->toIso8601String(),

                // stop relying on these
                'client_name' => null,
                'client_org' => null,
                'sample_codes' => [],

                // useful for FE filtering
                'sample_ids' => $sampleIds,
                'lo_id' => $loId,

                'file_url' => $lo->file_url,

                // IMPORTANT: always expose via secure endpoint
                'download_url' => url("/api/v1/reports/documents/loo/{$loId}/pdf"),
            ];
        }

        // -----------------------------
        // 2) Reagent Request documents (PDF)
        // -----------------------------
        // Best-effort: only if reagent_requests table exists
        try {
            if (Schema::hasTable('reagent_requests')) {
                $rrQuery = DB::table('reagent_requests as rr')
                    ->leftJoin('letters_of_order as lo', 'lo.lo_id', '=', 'rr.lo_id')
                    ->select([
                        'rr.reagent_request_id',
                        'rr.lo_id',
                        'rr.status',
                        'rr.file_url',
                        'rr.created_at',
                        'rr.updated_at',
                        'lo.number as loo_number',
                    ])
                    ->whereNotNull('rr.file_url')
                    // only approved docs belong in repository
                    ->where('rr.status', '=', 'approved')
                    ->orderByDesc('rr.reagent_request_id')
                    ->limit(300);

                $rrs = $rrQuery->get();

                foreach ($rrs as $rr) {
                    $rrId = (int) ($rr->reagent_request_id ?? 0);
                    $loId = (int) ($rr->lo_id ?? 0);

                    if ($rrId <= 0) continue;

                    // get sample_ids from LOO items (more reliable for filtering)
                    $sampleIds = $loId > 0 ? $getSampleIdsByLoId($loId) : [];
                    $sampleIds = array_values(array_unique(array_filter($sampleIds, fn($x) => $x > 0)));

                    // optional filter by sample_id
                    if ($sampleId && !in_array($sampleId, $sampleIds, true)) {
                        continue;
                    }

                    $looNumber = $rr->loo_number ? (string) $rr->loo_number : null;

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

                        'file_url' => $rr->file_url,

                        // secure endpoint too
                        'download_url' => url("/api/v1/reports/documents/reagent-request/{$rrId}/pdf"),
                    ];
                }
            }
        } catch (\Throwable) {
            // keep endpoint alive even if table/columns differ
        }

        // newest first by generated_at / created_at fallback (optional)
        usort($docs, function ($a, $b) {
            $ta = strtotime((string)($a['generated_at'] ?? $a['created_at'] ?? '')) ?: 0;
            $tb = strtotime((string)($b['generated_at'] ?? $b['created_at'] ?? '')) ?: 0;
            return $tb <=> $ta;
        });

        return response()->json(['data' => $docs]);
    }

    /**
     * GET /v1/reports/documents/{type}/{id}/pdf
     * Supported:
     * - loo/{lo_id}/pdf
     * - reagent-request/{reagent_request_id}/pdf
     */
    public function pdf(string $type, int $id)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $type = strtolower(trim($type));

        // -----------------------------
        // LOO
        // -----------------------------
        if ($type === 'loo') {
            $lo = LetterOfOrder::query()->where('lo_id', $id)->first();
            if (!$lo) {
                return response()->json(['message' => 'Document not found.'], 404);
            }

            // ✅ Step 3 gate: only allow view if there is at least 1 READY sample (OM+LH approved)
            if (!Schema::hasTable('loo_sample_approvals')) {
                return response()->json([
                    'message' => 'Approvals table not found. Run migrations.',
                    'code' => 'APPROVALS_TABLE_MISSING',
                ], 500);
            }

            $payload = is_array($lo->payload) ? $lo->payload : (array) $lo->payload;

            // sample_ids preferred, fallback to payload items
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

            if (count($sampleIds) <= 0) {
                return response()->json([
                    'message' => 'LOO payload tidak memiliki sample_ids/items yang valid.',
                    'code' => 'LOO_SAMPLES_MISSING',
                ], 422);
            }

            // Compute ready intersection based on current approvals
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

            // ✅ Always resolve raw file_url first
            $raw = $lo->file_url ? trim((string) $lo->file_url) : '';
            if ($raw === '') {
                return response()->json([
                    'message' => 'PDF file path is missing.',
                    'code' => 'PDF_PATH_MISSING',
                ], 404);
            }

            if (!$hasReady) {
                return response()->json([
                    'message' => 'LOO tidak bisa di-view karena belum ada sampel yang Ready (OM+LH approved).',
                    'code' => 'NO_READY_SAMPLES',
                ], 422);
            }

            $abs = $this->resolvePdfAbsolutePath(raw: $raw);

            if (!$abs || !is_file($abs)) {
                return response()->json([
                    'message' => 'PDF file not found on disk.',
                    'code' => 'PDF_NOT_FOUND',
                    'debug' => [
                        'raw' => $raw,
                        'abs' => $abs,
                    ],
                ], 404);
            }

            return response()->file($abs, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . basename($abs) . '"',
            ]);
        }

        // -----------------------------
        // Reagent Request
        // -----------------------------
        if (in_array($type, ['reagent-request', 'reagent_request', 'rr'], true)) {
            if (!Schema::hasTable('reagent_requests')) {
                return response()->json([
                    'message' => 'Reagent requests table not found. Run migrations.',
                    'code' => 'REAGENT_REQUESTS_TABLE_MISSING',
                ], 500);
            }

            $rr = DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->first();

            if (!$rr) {
                return response()->json(['message' => 'Document not found.'], 404);
            }

            // only allow view if approved (doc repo rule)
            $st = strtolower(trim((string)($rr->status ?? '')));
            if ($st !== 'approved') {
                return response()->json([
                    'message' => 'Reagent Request belum approved, PDF tidak bisa diakses.',
                    'code' => 'REAGENT_REQUEST_NOT_APPROVED',
                ], 422);
            }

            $raw = isset($rr->file_url) ? trim((string)$rr->file_url) : '';
            if ($raw === '') {
                return response()->json([
                    'message' => 'PDF file path is missing.',
                    'code' => 'PDF_PATH_MISSING',
                ], 404);
            }

            $abs = $this->resolvePdfAbsolutePath(raw: $raw);

            if (!$abs || !is_file($abs)) {
                return response()->json([
                    'message' => 'PDF file not found on disk.',
                    'code' => 'PDF_NOT_FOUND',
                    'debug' => [
                        'raw' => $raw,
                        'abs' => $abs,
                    ],
                ], 404);
            }

            return response()->file($abs, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . basename($abs) . '"',
            ]);
        }

        return response()->json(['message' => 'Unsupported document type.'], 400);
    }

    /**
     * Resolve file_url (db) into absolute path on server.
     *
     * Your REAL storage target:
     *   storage/app/private/reports/...
     *
     * Common issue:
     * - DB may store "letters/loo/..." (legacy)
     * - We must map it to "reports/loo/..."
     * - And because Laravel disk('local') root is storage/app,
     *   we must check "private/{path}".
     *
     * This resolver is intentionally permissive (LOO + Reagent Request can share it).
     */
    private function resolvePdfAbsolutePath(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') return null;

        // normalize slashes
        $raw = str_replace('\\', '/', $raw);

        // if full URL, take path only
        if (preg_match('/^https?:\/\//i', $raw)) {
            $p = parse_url($raw, PHP_URL_PATH);
            if (is_string($p) && $p !== '') {
                $raw = $p;
            }
        }

        $raw = trim($raw);
        $raw = str_replace('\\', '/', $raw);

        $candidates = [];

        // If has "/storage/xxx", strip to xxx (public link style)
        if (strpos($raw, '/storage/') !== false) {
            $after = substr($raw, strpos($raw, '/storage/') + strlen('/storage/'));
            if (is_string($after) && $after !== '') $candidates[] = $after;
        }

        // strip leading slash
        $rel = ltrim($raw, '/');
        if ($rel !== '') $candidates[] = $rel;

        // strip prefix "storage/"
        $candidates[] = preg_replace('#^storage/#', '', $rel);

        // strip prefix "public/"
        $candidates[] = preg_replace('#^public/#', '', $rel);

        // ✅ COMPAT: old path letters/loo -> reports/loo
        foreach ($candidates as $c) {
            $c = (string) $c;
            if (str_starts_with($c, 'letters/loo/')) {
                $candidates[] = preg_replace('#^letters/loo/#', 'reports/loo/', $c);
            }
        }

        // ✅ Also accept reagent request legacy-ish paths if any
        foreach ($candidates as $c) {
            $c = (string) $c;

            // letters/reagent_requests -> reports/reagent_requests (if you ever had legacy)
            if (str_starts_with($c, 'letters/reagent_requests/')) {
                $candidates[] = preg_replace('#^letters/reagent_requests/#', 'reports/reagent_requests/', $c);
            }
            if (str_starts_with($c, 'letters/reagent_request/')) {
                $candidates[] = preg_replace('#^letters/reagent_request/#', 'reports/reagent_request/', $c);
            }
        }

        // ✅ PRIMARY: your declared canonical root is reports/...
        foreach ($candidates as $c) {
            $c = (string) $c;
            if ($c !== '' && !str_contains($c, '/')) continue;

            // if already starts with reports/... or letters/... or private/..., skip
            if (str_starts_with($c, 'reports/') || str_starts_with($c, 'letters/') || str_starts_with($c, 'private/')) {
                continue;
            }

            // If it looks like "2026/xxx.pdf", try common report roots
            if (preg_match('#^\d{4}/.+\.pdf$#i', $c)) {
                $candidates[] = 'reports/loo/' . $c;
                $candidates[] = 'reports/reagent_requests/' . $c;
                $candidates[] = 'reports/reagent_request/' . $c;
            }
        }

        // uniq + clean
        $candidates = array_values(array_unique(array_filter($candidates, function ($v) {
            return is_string($v) && trim($v) !== '';
        })));

        // ✅ KEY FIX: also try private/{candidate}
        $withPrivatePrefix = [];
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            $withPrivatePrefix[] = $c;
            if (!str_starts_with($c, 'private/')) {
                $withPrivatePrefix[] = 'private/' . $c;
            }
        }
        $withPrivatePrefix = array_values(array_unique($withPrivatePrefix));

        // 1) check disk local (storage/app)
        $diskLocal = Storage::disk('local');
        foreach ($withPrivatePrefix as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            if ($diskLocal->exists($c)) {
                return $diskLocal->path($c);
            }
        }

        // 2) check disk public (storage/app/public) - just in case
        $diskPublic = Storage::disk('public');
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            if ($diskPublic->exists($c)) {
                return $diskPublic->path($c);
            }
        }

        // 3) direct absolute checks (fallbacks)
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            $pPrivate = storage_path('app/private/' . $c);
            if (is_file($pPrivate)) return $pPrivate;

            // if candidate accidentally already has private/
            if (str_starts_with($c, 'private/')) {
                $pPrivate2 = storage_path('app/' . $c);
                if (is_file($pPrivate2)) return $pPrivate2;
            }

            $pPublic = storage_path('app/public/' . $c);
            if (is_file($pPublic)) return $pPublic;

            $pPublicLink = public_path('storage/' . $c);
            if (is_file($pPublicLink)) return $pPublicLink;
        }

        // 4) last fallback: search by filename under common private roots
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
            /** @var \SplFileInfo $file */
            if ($iterator->getDepth() > $maxDepth) continue;

            if ($file->isFile() && $file->getFilename() === $filename) {
                return $file->getPathname();
            }
        }

        return null;
    }
}
