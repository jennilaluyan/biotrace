<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class SampleRequestQueueController extends Controller
{
    /**
     * GET /api/v1/samples/requests
     * Backoffice queue:
     * - ONLY non-draft (client draft is private)
     * - default: submitted/returned/needs_revision/ready_for_delivery/physically_received/...
     * - supports q + status
     */
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));
        $status = trim((string) $request->get('status', ''));

        $query = Sample::query()
            ->with(['client', 'requestedParameters']);

        // Draft is client-private
        if (Schema::hasColumn('samples', 'request_status')) {
            $query->where(function ($w) {
                $w->whereNull('request_status')
                    ->orWhere('request_status', '!=', 'draft');
            });
        }

        if ($status !== '') {
            $query->where('request_status', $status);
        }

        if ($q !== '') {
            $query->where(function ($w) use ($q) {
                $w->where('sample_type', 'ILIKE', "%{$q}%")
                    ->orWhere('request_status', 'ILIKE', "%{$q}%")
                    ->orWhere('lab_sample_code', 'ILIKE', "%{$q}%");
            });
        }

        $rows = $query->orderByDesc('sample_id')->paginate(15);

        return response()->json([
            'data' => $rows->items(),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
        ]);
    }
}