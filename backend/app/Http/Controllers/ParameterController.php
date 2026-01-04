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

    public function store(Request $request)
    {
        $this->authorize('create', Parameter::class);

        $data = $request->validate([
            'code'       => ['nullable', 'string', 'max:80'],
            'name'       => ['required', 'string', 'max:255'],
            'unit'       => ['nullable', 'string', 'max:80'],
            'unit_id'    => ['nullable', 'integer', 'exists:units,unit_id'],
            'method_ref' => ['nullable', 'string', 'max:120'],
            'status'     => ['nullable', 'string', 'max:50'],
            'tag'        => ['nullable', 'string', 'max:80'],
        ]);

        $p = Parameter::create($data);

        return ApiResponse::success(
            $p->only(['parameter_id', 'code', 'name', 'unit', 'unit_id', 'method_ref', 'status', 'tag']),
            'Parameter created',
            201,
            ['resource' => 'parameters']
        );
    }

    public function update(Request $request, Parameter $parameter)
    {
        $this->authorize('update', $parameter);

        $data = $request->validate([
            'code'       => ['nullable', 'string', 'max:80'],
            'name'       => ['sometimes', 'required', 'string', 'max:255'],
            'unit'       => ['nullable', 'string', 'max:80'],
            'unit_id'    => ['nullable', 'integer', 'exists:units,unit_id'],
            'method_ref' => ['nullable', 'string', 'max:120'],
            'status'     => ['nullable', 'string', 'max:50'],
            'tag'        => ['nullable', 'string', 'max:80'],
        ]);

        $parameter->fill($data);
        $parameter->save();

        return ApiResponse::success(
            $parameter->only(['parameter_id', 'code', 'name', 'unit', 'unit_id', 'method_ref', 'status', 'tag']),
            'Parameter updated',
            200,
            ['resource' => 'parameters']
        );
    }

    public function destroy(Parameter $parameter)
    {
        $this->authorize('delete', $parameter);

        $parameter->delete();

        return ApiResponse::success(
            null,
            'Parameter deleted',
            200,
            ['resource' => 'parameters']
        );
    }
}
