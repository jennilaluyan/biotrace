<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class SampleRequestQueueController extends Controller
{
    /**
     * GET /api/v1/samples/requests
     *
     * Query params:
     * - request_status=submitted|ready_for_delivery|physically_received|...
     * - submitted_from=YYYY-MM-DD
     * - submitted_to=YYYY-MM-DD
     * - q=search
     * - date=today|7d|30d (optional shortcut)
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Sample::class);

        $query = Sample::query()->with(['client', 'creator', 'assignee', 'requestedParameters']);

        if ($request->filled('request_status')) {
            $query->where('request_status', $request->string('request_status')->toString());
        }

        if ($request->filled('submitted_from')) {
            $query->whereDate('submitted_at', '>=', $request->get('submitted_from'));
        }

        if ($request->filled('submitted_to')) {
            $query->whereDate('submitted_at', '<=', $request->get('submitted_to'));
        }

        // shortcut date filter
        if ($request->filled('date')) {
            $v = strtolower(trim((string) $request->get('date')));
            $now = Carbon::now();
            if ($v === 'today') {
                $query->whereDate('submitted_at', '=', $now->toDateString());
            } elseif ($v === '7d') {
                $query->where('submitted_at', '>=', $now->copy()->subDays(7));
            } elseif ($v === '30d') {
                $query->where('submitted_at', '>=', $now->copy()->subDays(30));
            }
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->get('q'));
            if ($q !== '') {
                $query->where(function ($w) use ($q) {
                    $w->where('sample_id', (int) $q)
                        ->orWhereHas('client', fn($c) => $c->where('name', 'ILIKE', "%{$q}%"))
                        ->orWhere('sample_type', 'ILIKE', "%{$q}%")
                        ->orWhere('lab_sample_code', 'ILIKE', "%{$q}%")
                        ->orWhere('request_status', 'ILIKE', "%{$q}%");
                });
            }
        }

        // newest first (submitted_at first, fallback to scheduled_delivery_at, fallback to received_at)
        $query->orderByRaw('COALESCE(submitted_at, scheduled_delivery_at, received_at) DESC');

        $rows = $query->paginate(15);

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