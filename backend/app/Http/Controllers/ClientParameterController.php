<?php

namespace App\Http\Controllers;

use App\Models\Parameter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ClientParameterController extends Controller
{
    /**
     * GET /api/v1/client/parameters
     * Client can browse/search parameters.
     */
    public function index(Request $request): JsonResponse
    {
        // Ensure this endpoint is only for authenticated client
        // (kalau route group kamu sudah auth:client_api, ini extra safety)
        if (!Auth::guard('client_api')->check()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $perPage = (int) $request->query('per_page', 20);
        $q = trim((string) $request->query('q', ''));

        $query = Parameter::query()->orderBy('parameter_id', 'asc');

        // kalau di table parameters ada kolom "is_active" / "status", filter di sini (optional)
        if (schema_has_column('parameters', 'is_active')) {
            $query->where('is_active', true);
        }

        if ($q !== '') {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'ilike', "%{$q}%")
                    ->orWhere('code', 'ilike', "%{$q}%")
                    ->orWhere('unit', 'ilike', "%{$q}%");
            });
        }

        $rows = $query->paginate($perPage);

        return response()->json([
            'data' => $rows,
        ], 200);
    }
}

/**
 * Helper kecil biar nggak crash kalau schema facade ga diimport.
 */
function schema_has_column(string $table, string $column): bool
{
    try {
        return \Illuminate\Support\Facades\Schema::hasColumn($table, $column);
    } catch (\Throwable $e) {
        return false;
    }
}