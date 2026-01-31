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

            $docName = 'Letter of Order (LOO)'; // atau "Surat Perintah Pengujian Sampel" kalau mau full Indo
            $docCode = (string) $lo->number;

            $docs[] = [
                'type' => 'LOO',
                'id' => (int) $lo->lo_id,

                // ✅ doc-centric fields (NEW)
                'document_name' => $docName,
                'document_code' => $docCode,

                // keep number for compatibility (frontend lama masih pakai)
                'number' => $docCode,

                'status' => (string) ($lo->loa_status ?? 'draft'),
                'generated_at' => $lo->generated_at?->toIso8601String(),
                'created_at' => $lo->created_at?->toIso8601String(),

                // ✅ stop relying on these (set null so UI stops showing)
                'client_name' => null,
                'client_org' => null,
                'sample_codes' => [],

                'file_url' => $lo->file_url,
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

        $raw = $lo->file_url ? trim((string) $lo->file_url) : '';
        if ($raw === '') {
            return response()->json(['message' => 'PDF file path is missing.'], 404);
        }

        $abs = $this->resolvePdfAbsolutePath($raw);

        if (!$abs || !is_file($abs)) {
            return response()->json([
                'message' => 'PDF file not found on disk.',
                'debug' => [
                    'file_url' => $raw,
                    'expected_root' => storage_path('app/private'),
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
     * IMPORTANT:
     * - Disk "local" kamu root-nya storage/app/private (lihat filesystems.php)
     *   jadi path RELATIF seperti "reports/loo/2026/x.pdf" akan dicari di:
     *   storage/app/private/reports/loo/2026/x.pdf
     */
    private function resolvePdfAbsolutePath(string $raw): ?string
    {
        $raw = trim($raw);
        if ($raw === '') return null;

        // normalize windows slash
        $raw = str_replace('\\', '/', $raw);

        // kalau full URL, ambil path doang
        if (preg_match('/^https?:\/\//i', $raw)) {
            $p = parse_url($raw, PHP_URL_PATH);
            if (is_string($p) && $p !== '') {
                $raw = $p;
            }
        }

        $raw = trim($raw);
        $raw = str_replace('\\', '/', $raw);

        $candidates = [];

        // /storage/xxx => xxx (kadang kebawa dari public url)
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

        // COMPAT: data lama mungkin simpan letters/loo/... tapi kamu ingin reports/loo/...
        foreach ($candidates as $c) {
            $c = (string) $c;
            if (str_starts_with($c, 'letters/loo/')) {
                $candidates[] = preg_replace('#^letters/loo/#', 'reports/loo/', $c);
            }
        }

        // uniq + clean
        $candidates = array_values(array_unique(array_filter($candidates, function ($v) {
            return is_string($v) && trim($v) !== '';
        })));

        // 1) Paling utama: disk local (root storage/app/private)
        $diskLocal = Storage::disk('local');
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            if ($diskLocal->exists($c)) {
                return $diskLocal->path($c);
            }
        }

        // 2) Cadangan: disk public (kalau suatu saat kamu taruh di public)
        $diskPublic = Storage::disk('public');
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            if ($diskPublic->exists($c)) {
                return $diskPublic->path($c);
            }
        }

        // 3) fallback: direct absolute-ish checks (just in case)
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;

            $pPrivate = storage_path('app/private/' . $c);
            if (is_file($pPrivate)) return $pPrivate;

            $pPublic = storage_path('app/public/' . $c);
            if (is_file($pPublic)) return $pPublic;

            $pPublicLink = public_path('storage/' . $c);
            if (is_file($pPublicLink)) return $pPublicLink;
        }

        // 4) last fallback: search by filename under private reports/loo + letters/loo
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
