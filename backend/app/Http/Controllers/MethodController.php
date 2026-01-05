<?php

namespace App\Http\Controllers;

use App\Http\Requests\MethodRequest;
use App\Models\Method;
use App\Support\ApiResponse;
use Illuminate\Database\QueryException;
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

    public function store(MethodRequest $request)
    {
        $this->authorize('create', Method::class);

        try {
            $method = Method::create([
                'name'        => $request->input('name'),
                'code'        => $request->input('code'),
                'description' => $request->input('description'),
                'is_active'   => $request->boolean('is_active', true),
            ]);

            return ApiResponse::success(
                $method->only(['method_id', 'code', 'name', 'description', 'is_active']),
                'Method created',
                201,
                ['resource' => 'methods']
            );
        } catch (QueryException $e) {
            // Postgres unique violation SQLSTATE 23505
            if (($e->errorInfo[0] ?? null) === '23505') {
                return response()->json([
                    'timestamp' => now()->toIso8601String(),
                    'status' => 422,
                    'message' => 'Name or code already exists.',
                    'data' => null,
                ], 422);
            }
            throw $e;
        }
    }

    public function update(MethodRequest $request, Method $method)
    {
        $this->authorize('update', $method);

        try {
            $method->fill([
                'name'        => $request->input('name', $method->name),
                'code'        => $request->input('code', $method->code),
                'description' => $request->input('description', $method->description),
            ]);

            if ($request->has('is_active')) {
                $method->is_active = $request->boolean('is_active');
            }

            $method->save();

            return ApiResponse::success(
                $method->only(['method_id', 'code', 'name', 'description', 'is_active']),
                'Method updated',
                200,
                ['resource' => 'methods']
            );
        } catch (QueryException $e) {
            if (($e->errorInfo[0] ?? null) === '23505') {
                return response()->json([
                    'timestamp' => now()->toIso8601String(),
                    'status' => 422,
                    'message' => 'Name or code already exists.',
                    'data' => null,
                ], 422);
            }
            throw $e;
        }
    }

    public function destroy(Method $method)
    {
        $this->authorize('delete', $method);

        $method->delete();

        return ApiResponse::success(
            null,
            'Method deleted',
            200,
            ['resource' => 'methods']
        );
    }
}
