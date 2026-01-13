<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', AuditLog::class);

        // --------------------
        // Query validation
        // --------------------
        $validated = $request->validate([
            'page'        => 'sometimes|integer|min:1',
            'per_page'    => 'sometimes|integer|min:1|max:100',
            'action'      => 'sometimes|string|max:40',
            'staff_id'    => 'sometimes|integer|min:1',
            'entity_name' => 'sometimes|string|max:80',
            'sample_id'   => 'sometimes|integer|min:1',
            'sample_test_id' => 'sometimes|integer|min:1',
            'from'        => 'sometimes|date',
            'to'          => 'sometimes|date|after_or_equal:from',
        ]);

        $perPage = $validated['per_page'] ?? 25;

        $q = AuditLog::query();

        // --------------------
        // Filters
        // --------------------
        if (!empty($validated['action'])) {
            $q->where('action', strtoupper($validated['action']));
        }

        if (!empty($validated['staff_id'])) {
            $q->where('staff_id', $validated['staff_id']);
        }

        if (!empty($validated['entity_name'])) {
            $q->where('entity_name', $validated['entity_name']);
        }

        if (!empty($validated['sample_test_id'])) {
            $q->where('entity_name', 'sample_test')
                ->where('entity_id', $validated['sample_test_id']);
        }

        if (!empty($validated['sample_id'])) {
            $sampleId = $validated['sample_id'];

            $q->where('entity_name', 'sample_test')
                ->whereIn('entity_id', function ($sub) use ($sampleId) {
                    $sub->from('sample_tests')
                        ->select('sample_test_id')
                        ->where('sample_id', $sampleId);
                });
        }

        if (!empty($validated['from'])) {
            $q->where('timestamp', '>=', $validated['from']);
        }

        if (!empty($validated['to'])) {
            $q->where('timestamp', '<=', $validated['to']);
        }

        // --------------------
        // Ordering + pagination
        // --------------------
        $paged = $q
            ->orderByDesc('timestamp')
            ->paginate($perPage);

        return response()->json([
            'status'  => 200,
            'message' => 'Audit logs fetched.',
            'data'    => $paged,
        ]);
    }
}
