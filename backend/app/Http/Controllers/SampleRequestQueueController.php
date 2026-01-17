<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SampleRequestQueueController extends Controller
{
    /**
     * GET /api/v1/samples/requests
     *
     * Query params:
     * - request_status=submitted|ready_for_delivery|physically_received|...
     * - submitted_from=YYYY-MM-DD
     * - submitted_to=YYYY-MM-DD
     */
    public function index(Request $request): JsonResponse
    {
        // RBAC: reuse SamplePolicy@viewAny (staff internal only)
        $this->authorize('viewAny', Sample::class);

        $query = Sample::query()->with(['client', 'creator', 'assignee']);

        if ($request->filled('request_status')) {
            $query->where('request_status', $request->string('request_status')->toString());
        }

        if ($request->filled('submitted_from')) {
            $query->whereDate('submitted_at', '>=', $request->get('submitted_from'));
        }

        if ($request->filled('submitted_to')) {
            $query->whereDate('submitted_at', '<=', $request->get('submitted_to'));
        }

        // Sorting: submitted_at terbaru dulu, fallback ke received_at kalau submitted_at null
        // Postgres friendly
        $query->orderByRaw('COALESCE(submitted_at, received_at) DESC');

        $rows = $query->paginate(15);

        return response()->json([
            'data' => $rows->items(),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page'    => $rows->lastPage(),
                'per_page'     => $rows->perPage(),
                'total'        => $rows->total(),
            ],
        ]);
    }
}
