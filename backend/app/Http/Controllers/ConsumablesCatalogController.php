<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConsumablesCatalogController extends Controller
{
    /**
     * GET /v1/catalog/consumables
     * Query params:
     * - search: string (optional)
     * - type: bhp|reagen (optional)
     * - active: 1|0|all (optional, default 1)
     * - per_page: int (optional, default 25, max 100)
     * - page: int (optional)
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $type = $request->query('type'); // bhp|reagen|null
        $active = $request->query('active', '1'); // default only active
        $perPage = (int) $request->query('per_page', 25);
        $perPage = max(1, min($perPage, 100));

        $q = DB::table('consumables_catalog');

        // filter type
        if (is_string($type) && in_array($type, ['bhp', 'reagen'], true)) {
            $q->where('item_type', $type);
        }

        // filter active
        // active=1 => is_active true
        // active=0 => is_active false
        // active=all => no filter
        if ($active !== 'all') {
            $q->where('is_active', (string) $active === '1');
        }

        // search (name + specification + default_unit_text)
        if ($search !== '') {
            $like = '%' . str_replace('%', '\\%', $search) . '%';
            $q->where(function ($sub) use ($like) {
                $sub->where('name', 'like', $like)
                    ->orWhere('specification', 'like', $like)
                    ->orWhere('default_unit_text', 'like', $like);
            });
        }

        // order: active first, then name asc
        $q->orderByDesc('is_active')
            ->orderBy('name');

        $p = $q->paginate($perPage);

        // shape output
        $items = collect($p->items())->map(function ($row) {
            return [
                'catalog_id' => $row->catalog_id,
                'item_type' => $row->item_type,                  // bhp | reagen
                'name' => $row->name,
                'specification' => $row->specification,
                'default_unit_text' => $row->default_unit_text,  // best-effort (from Excel)
                'default_unit_id' => $row->default_unit_id,      // nullable
                'category' => $row->category,                    // nullable
                'is_active' => (bool) $row->is_active,
            ];
        })->values();

        return ApiResponse::success(
            data: $items,
            message: 'Consumables catalog',
            status: 200,
            extra: [
                'resource' => 'catalog',
                'meta' => [
                    'page' => $p->currentPage(),
                    'per_page' => $p->perPage(),
                    'total' => $p->total(),
                    'last_page' => $p->lastPage(),
                    'filters' => [
                        'search' => $search !== '' ? $search : null,
                        'type' => (is_string($type) && in_array($type, ['bhp', 'reagen'], true)) ? $type : null,
                        'active' => $active,
                    ],
                ],
            ]
        );
    }
}