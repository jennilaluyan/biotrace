<?php

namespace App\Http\Controllers;

use App\Models\Unit;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class UnitController extends Controller
{
    /**
     * GET /api/v1/units
     * List units (for dropdown unit_id in test results)
     */
    public function index(Request $request)
    {
        $q = Unit::query()
            ->select(['unit_id', 'name', 'symbol', 'description', 'is_active'])
            ->orderBy('unit_id');

        if ($search = $request->query('q')) {
            $q->where(function ($w) use ($search) {
                $w->where('name', 'ilike', "%{$search}%")
                    ->orWhere('symbol', 'ilike', "%{$search}%");
            });
        }

        // default 50, max 100 (ngikut pattern Parameter/Method)
        $perPage = (int) $request->query('per_page', 50);
        $perPage = max(1, min($perPage, 100));

        return ApiResponse::success(
            $q->paginate($perPage),
            'Units fetched',
            200,
            ['resource' => 'units']
        );
    }
}
