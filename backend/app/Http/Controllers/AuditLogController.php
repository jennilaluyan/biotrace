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
        // (optional) batasi role yang boleh lihat audit log
        // kalau kamu sudah punya policy/gate, pakai authorize di sini
        // $this->authorize('viewAny', AuditLog::class);

        $perPage = (int) $request->query('per_page', 25);
        if ($perPage < 1) $perPage = 25;
        if ($perPage > 100) $perPage = 100;

        $q = AuditLog::query();

        // -------------------- filters --------------------
        if ($request->filled('action')) {
            $q->where('action', $request->query('action'));
        }

        if ($request->filled('staff_id')) {
            $q->where('staff_id', (int) $request->query('staff_id'));
        }

        // entity sample_test by sample_test_id
        if ($request->filled('sample_test_id')) {
            $q->where('entity_name', 'sample_test')
                ->where('entity_id', (int) $request->query('sample_test_id'));
        }

        // filter by sample_id (join sample_tests)
        if ($request->filled('sample_id')) {
            $sampleId = (int) $request->query('sample_id');

            $q->where('entity_name', 'sample_test')
                ->whereIn('entity_id', function ($sub) use ($sampleId) {
                    $sub->from('sample_tests')
                        ->select('sample_test_id')
                        ->where('sample_id', $sampleId);
                });
        }

        // -------------------- ordering + pagination --------------------
        // gunakan kolom timestamp kalau ada, kalau tidak pakai created_at
        $orderCol = Schema::hasColumn('audit_logs', 'timestamp') ? 'timestamp' : 'created_at';

        $paged = $q->orderByDesc($orderCol)->paginate($perPage);

        return response()->json([
            'status' => 200,
            'message' => 'Audit logs fetched.',
            'data' => $paged,
        ], 200);
    }
}
