<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ReportDocumentsController extends Controller
{
    /**
     * GET /v1/reports/documents
     * Central repository for downloadable documents (LOO now, extensible later).
     */
    public function index(): JsonResponse
    {
        $docs = [];

        $loos = LetterOfOrder::query()
            ->with([
                'items',
                'sample.client',
            ])
            ->orderByDesc('generated_at')
            ->limit(200)
            ->get();

        foreach ($loos as $lo) {
            $sampleCodes = [];

            if ($lo->items) {
                foreach ($lo->items as $it) {
                    $code = $it->lab_sample_code ?? null;
                    if (!empty($code)) $sampleCodes[] = (string) $code;
                }
            }

            $sampleCodes = array_values(array_unique($sampleCodes));
            $client = $lo->sample?->client;

            $docName = 'Letter of Order (LOO)';
            $docCode = (string) $lo->number;

            $docs[] = [
                'type' => 'LOO',
                'id' => (int) $lo->lo_id,

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

                'file_url' => $lo->file_url,

                // IMPORTANT: always expose via secure endpoint
                'download_url' => url("/api/v1/reports/documents/loo/{$lo->lo_id}/pdf"),
            ];
        }

        return response()->json(['data' => $docs]);
    }

    /**
     * GET /v1/reports/documents/{type}/{id}/pdf
     */
    public function pdf(string $type, int $id)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $type = strtolower(trim($type));
        if ($type !== 'loo') {
            return response()->json(['message' => 'Unsupported document type.'], 400);
        }

        $lo = LetterOfOrder::query()->where('lo_id', $id)->first();
        if (!$lo) {
            return response()->json(['message' => 'Document not found.'], 404);
        }

        // ✅ Step 3 gate: only allow view if there is at least 1 READY sample (OM+LH approved)
        if (!\Illuminate\Support\Facades\Schema::hasTable('loo_sample_approvals')) {
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
        $rows = \Illuminate\Support\Facades\DB::table('loo_sample_approvals')
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

        // ✅ Always resolve raw file_url first (used by later path resolve / debug)
        $raw = $lo->file_url ? trim((string) $lo->file_url) : '';
        if ($raw === '') {
            return response()->json([
                'message' => 'PDF file path is missing.',
                'code' => 'PDF_PATH_MISSING',
            ], 404);
        }

        // ✅ Step 3 gate: only allow view if there is at least 1 READY sample (OM+LH approved)
        // (your existing readiness computation stays here)
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

    /**
     * Resolve file_url (db) into absolute path on server.
     *
     * Your REAL storage target:
     *   storage/app/private/reports/loo/...
     *
     * Common issue:
     * - DB may store "letters/loo/..." (legacy)
     * - We must map it to "reports/loo/..."
     * - And because Laravel disk('local') root is storage/app,
     *   we must check "private/{path}".
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

        // ✅ PRIMARY: your declared canonical root is reports/loo
        // If somebody stores just "2026/xxx.pdf", make it reports/loo/2026/xxx.pdf
        foreach ($candidates as $c) {
            $c = (string) $c;
            if ($c !== '' && !str_contains($c, '/')) continue;

            // if already starts with reports/loo or letters/loo, skip
            if (str_starts_with($c, 'reports/loo/') || str_starts_with($c, 'letters/loo/') || str_starts_with($c, 'private/')) {
                continue;
            }

            // If it looks like "2026/xxx.pdf" or "loo/2026/xxx.pdf"
            if (preg_match('#^\d{4}/.+\.pdf$#i', $c)) {
                $candidates[] = 'reports/loo/' . $c;
            } elseif (preg_match('#^loo/\d{4}/.+\.pdf$#i', $c)) {
                $candidates[] = 'reports/' . $c;
            }
        }

        // uniq + clean
        $candidates = array_values(array_unique(array_filter($candidates, function ($v) {
            return is_string($v) && trim($v) !== '';
        })));

        // ✅ KEY FIX:
        // Laravel disk('local') root = storage/app
        // but your files are in storage/app/private/...
        // so we must also try "private/{candidate}"
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

        // 4) last fallback: search by filename under private reports/loo (and letters/loo for legacy)
        $filename = basename($rel);
        if ($filename) {
            $roots = [
                storage_path('app/private/reports/loo'),
                storage_path('app/private/letters/loo'),
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
