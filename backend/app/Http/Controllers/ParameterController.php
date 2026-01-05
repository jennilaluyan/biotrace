<?php

namespace App\Http\Controllers;

use App\Http\Requests\ParameterRequest;
use App\Models\Parameter;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

class ParameterController extends Controller
{
    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Parameter::class);

        $q = trim((string) request('q', ''));
        $perPage = (int) request('per_page', 20);

        $query = Parameter::query();

        if ($q !== '') {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'ilike', "%{$q}%")
                    ->orWhere('code', 'ilike', "%{$q}%");
            });
        }

        $query->orderBy('parameter_id', 'desc');

        return ApiResponse::success($query->paginate($perPage));
    }

    public function store(ParameterRequest $request): JsonResponse
    {
        $this->authorize('create', Parameter::class);

        $data = $request->validated();
        $data['created_by'] = $request->user()->staff_id;

        $row = Parameter::create($data);

        return ApiResponse::success($row, 'Parameter created.', 201);
    }

    public function update(ParameterRequest $request, Parameter $parameter): JsonResponse
    {
        $this->authorize('update', $parameter);

        $parameter->fill($request->validated());
        $parameter->save();

        return ApiResponse::success($parameter, 'Parameter updated.');
    }

    public function destroy(Parameter $parameter): JsonResponse
    {
        $this->authorize('delete', $parameter);

        $parameter->delete();

        return ApiResponse::success(null, 'Parameter deleted.');
    }
}
