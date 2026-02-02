<?php
// L:\Campus\Final Countdown\biotrace\backend\app\Http\Controllers\ConsumablesCatalogController.php

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
        $search  = trim((string) $request->query('search', ''));
        $type    = $request->query('type');           // bhp|reagen|null
        $active  = $request->query('active', '1');    // default only active
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

        // search (name + specification + category + default_unit_text + source_sheet)
        if ($search !== '') {
            $like = '%' . str_replace('%', '\\%', $search) . '%';
            $q->where(function ($sub) use ($like) {
                $sub->where('name', 'like', $like)
                    ->orWhere('specification', 'like', $like)
                    ->orWhere('category', 'like', $like)
                    ->orWhere('default_unit_text', 'like', $like)
                    ->orWhere('source_sheet', 'like', $like);
            });
        }

        // order: active first, then type, then name asc
        $q->orderByDesc('is_active')
            ->orderBy('item_type')
            ->orderBy('name');

        $p = $q->paginate($perPage);

        // IMPORTANT:
        // Frontend expects:
        // - type        (bhp|reagen)   -> from item_type
        // - item_name   (string)       -> from name
        // - item_code   (string)       -> from specification (Excel "kode" / "ID" values)
        // - default_unit (string|null) -> from default_unit_text
        // - source_sheet (string|null) -> from source_sheet
        $items = collect($p->items())->map(function ($row) {
            return [
                'catalog_id'    => $row->catalog_id,
                'type'          => $row->item_type,                 // bhp | reagen
                'item_name'     => (string) ($row->name ?? ''),
                'item_code'     => (string) ($row->specification ?? ''),
                'category'      => $row->category,
                'default_unit'  => $row->default_unit_text,         // best-effort (from Excel)
                'is_active'     => (bool) $row->is_active,
                'source_sheet'  => $row->source_sheet,
                'created_at'    => $row->created_at ?? null,
                'updated_at'    => $row->updated_at ?? null,
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