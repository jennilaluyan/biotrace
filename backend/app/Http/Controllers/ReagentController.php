<?php

namespace App\Http\Controllers;

use App\Models\Reagent;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class ReagentController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Reagent::class);

        $q = Reagent::query()
            ->select(['reagent_id', 'code', 'name', 'description', 'unit_id', 'is_active'])
            ->orderBy('reagent_id');

        if ($search = $request->query('q')) {
            $q->where(function ($w) use ($search) {
                $w->where('name', 'ilike', "%{$search}%")
                    ->orWhere('code', 'ilike', "%{$search}%");
            });
        }

        $perPage = (int) $request->query('per_page', 20);
        $perPage = max(1, min($perPage, 100));

        return ApiResponse::success(
            $q->paginate($perPage),
            'Reagents fetched',
            200,
            ['resource' => 'reagents']
        );
    }
}
