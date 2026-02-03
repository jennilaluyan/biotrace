<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class EquipmentCatalogController extends Controller
{
    /**
     * GET /v1/equipment/catalog
     * Query params:
     * - search: string (optional)
     * - per_page: int (optional, default 60, max 200)
     * - page: int (optional)
     */
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 60);
        $perPage = max(1, min(200, $perPage));

        // ✅ Source of truth sesuai DB kamu: equipment_catalog
        $q = DB::table('equipment_catalog')
            ->select([
                'equipment_id',
                DB::raw('equipment_code as code'),
                'name',
                // kolom opsional (aman kalau ada)
                DB::raw("COALESCE(location, NULL) as location"),
                DB::raw("COALESCE(status, NULL) as status"),
            ])
            ->orderBy('equipment_id', 'asc');

        if ($search !== '') {
            // PostgreSQL case-insensitive
            $like = '%' . str_replace('%', '\\%', $search) . '%';

            $q->where(function ($w) use ($like) {
                $w->where('equipment_code', 'ILIKE', $like)
                    ->orWhere('name', 'ILIKE', $like)
                    ->orWhere('manufacturer', 'ILIKE', $like)
                    ->orWhere('model', 'ILIKE', $like);
            });
        }

        $rows = $q->paginate($perPage);

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
