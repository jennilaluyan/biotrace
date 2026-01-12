<?php

namespace App\Http\Controllers;

use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class PublicCoaVerificationController extends Controller
{
    /**
     * Public verification endpoint (READ ONLY).
     */
    public function verify(string $hash): JsonResponse
    {
        $report = Report::query()
            ->where('document_hash', $hash)
            ->where('is_locked', true)
            ->first();

        if (!$report) {
            return response()->json([
                'valid' => false,
                'message' => 'Document not found or not finalized.',
            ], 404);
        }

        if (!$report->pdf_url) {
            return response()->json([
                'valid' => false,
                'message' => 'PDF not available.',
            ], 404);
        }

        $disk = config('filesystems.default');

        if (!Storage::disk($disk)->exists($report->pdf_url)) {
            return response()->json([
                'valid' => false,
                'message' => 'PDF file missing.',
            ], 404);
        }

        return response()->json([
            'valid' => true,
            'document' => [
                'report_no'   => $report->report_no,
                'issued_at'   => optional($report->created_at)->toDateString(),
                'locked_at'   => optional($report->updated_at)->toDateString(),
            ],
        ]);
    }
}
