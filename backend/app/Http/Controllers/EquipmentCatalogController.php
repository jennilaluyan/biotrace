<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class EquipmentCatalogController extends Controller
{
    /**
     * GET /v1/equipment/catalog
     * Query:
     * - search (optional)
     * - per_page (optional, default 60, max 200)
     * - page (optional)
     */
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 60);
        $perPage = max(1, min(200, $perPage));

        // ✅ Sesuaikan nama tabel kalau di project kamu beda
        $table = null;
        if (Schema::hasTable('equipments')) $table = 'equipments';
        elseif (Schema::hasTable('equipment')) $table = 'equipment';

        if (!$table) {
            // biar FE nggak “no equipment found” karena 404 lagi
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => $perPage,
                    'total' => 0,
                ],
                'message' => 'Equipment table not found (expected equipments/equipment).',
            ], 200);
        }

        $q = DB::table($table);

        // Kolom umum yang biasanya ada
        // - id/equipment_id
        // - code
        // - name
        // - location
        // - status
        $idCol = Schema::hasColumn($table, 'equipment_id') ? 'equipment_id' : 'id';

        if ($search !== '') {
            $q->where(function ($w) use ($table, $search) {
                if (Schema::hasColumn($table, 'code')) {
                    $w->orWhere('code', 'like', "%{$search}%");
                }
                if (Schema::hasColumn($table, 'name')) {
                    $w->orWhere('name', 'like', "%{$search}%");
                }
                if (Schema::hasColumn($table, 'location')) {
                    $w->orWhere('location', 'like', "%{$search}%");
                }
            });
        }

        $q->orderBy($idCol, 'desc');

        $rows = $q->paginate($perPage);

        // Normalize payload supaya FE stabil
        $data = collect($rows->items())->map(function ($r) use ($idCol) {
            return [
                'equipment_id' => $r->equipment_id ?? $r->$idCol ?? null,
                'code' => $r->code ?? null,
                'name' => $r->name ?? null,
                'location' => $r->location ?? null,
                'status' => $r->status ?? null,
            ];
        })->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
        ]);
    }
}
