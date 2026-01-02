<?php

namespace App\Http\Controllers;

use App\Models\Method;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class MethodController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Method::class);

        $q = Method::query()
            ->select(['method_id', 'code', 'name', 'description', 'is_active'])
            ->orderBy('method_id');

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
            'Methods fetched',
            200,
            ['resource' => 'methods']
        );
    }
}
