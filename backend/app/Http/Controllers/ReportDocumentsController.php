<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
use Illuminate\Http\JsonResponse;

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
            /** @var LetterOfOrder $lo */

            $sampleCodes = [];

            // Avoid relationLoaded() to keep IDE/static analysis happy.
            // If items are eager-loaded, $lo->items exists and is iterable.
            if ($lo->items) {
                foreach ($lo->items as $it) {
                    // best effort: only push when exists
                    $code = $it->lab_sample_code ?? null;
                    if (!empty($code)) $sampleCodes[] = (string) $code;
                }
            }

            $sampleCodes = array_values(array_unique($sampleCodes));

            $client = $lo->sample?->client;

            $docs[] = [
                'type' => 'LOO',
                'id' => (int) $lo->lo_id,
                'number' => (string) $lo->number,
                'status' => (string) ($lo->loa_status ?? 'draft'),
                'generated_at' => $lo->generated_at?->toIso8601String(),
                'created_at' => $lo->created_at?->toIso8601String(),
                'client_name' => $client?->name,
                'client_org' => $client?->organization,
                'sample_codes' => $sampleCodes,
                'file_url' => $lo->file_url,
                'download_url' => $this->toPublicUrl($lo->file_url),
            ];
        }

        return response()->json([
            'data' => $docs,
        ]);
    }

    /**
     * Convert stored path into a public URL.
     * We avoid Storage::url() here to prevent IDE/static-analysis issues.
     */
    private function toPublicUrl(?string $path): ?string
    {
        if (!$path) return null;

        $path = trim($path);

        // If already absolute URL
        if (preg_match('/^https?:\/\//i', $path)) return $path;

        // If already has /storage prefix or absolute path
        if (str_starts_with($path, '/storage/')) {
            return url($path);
        }

        if (str_starts_with($path, '/')) {
            // Some apps store absolute-ish path already
            return url($path);
        }

        // Default: assume public disk served via /storage/<path>
        return url('/storage/' . ltrim($path, '/'));
    }
}
