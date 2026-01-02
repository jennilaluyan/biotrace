<?php

namespace App\Http\Controllers;

use App\Models\Parameter;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class ParameterController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Parameter::class);

        $q = Parameter::query()
            ->select(['parameter_id', 'code', 'name', 'unit', 'unit_id', 'method_ref', 'status', 'tag'])
            ->orderBy('parameter_id');

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
            'Parameters fetched',
            200,
            ['resource' => 'parameters']
        );
    }
}
