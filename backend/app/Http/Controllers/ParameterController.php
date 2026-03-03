<?php

namespace App\Http\Controllers;

use App\Http\Requests\ParameterRequest;
use App\Models\Parameter;
use App\Support\ApiResponse;
use App\Support\AuditDiffBuilder;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;

class ParameterController extends Controller
{
    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Parameter::class);

        $q = trim((string) request('q', ''));
        $perPage = max(1, min(100, (int) request('per_page', 20)));

        $query = Parameter::query();

        if ($q !== '') {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'ilike', "%{$q}%")
                    ->orWhere('code', 'ilike', "%{$q}%");
            });
        }

        $query->orderByDesc('parameter_id');

        return ApiResponse::success($query->paginate($perPage));
    }

    public function store(ParameterRequest $request): JsonResponse
    {
        $this->authorize('create', Parameter::class);

        $staffId = (int) ($request->user()?->staff_id ?? 0);

        $data = $request->validated();
        $data['created_by'] = $staffId;

        $row = Parameter::create($data);

        AuditLogger::write(
            action: 'PARAMETER_CREATED',
            staffId: $staffId,
            entityName: 'parameters',
            entityId: (int) $row->parameter_id,
            oldValues: null,
            newValues: $row->only([
                'parameter_id',
                'catalog_no',
                'code',
                'name',
                'workflow_group',
                'unit',
                'unit_id',
                'method_ref',
                'status',
                'tag',
            ])
        );

        return ApiResponse::success($row, 'Parameter created.', 201);
    }

    public function update(ParameterRequest $request, Parameter $parameter): JsonResponse
    {
        $this->authorize('update', $parameter);

        $staffId = (int) ($request->user()?->staff_id ?? 0);

        $before = $parameter->only([
            'catalog_no',
            'code',
            'name',
            'workflow_group',
            'unit',
            'unit_id',
            'method_ref',
            'status',
            'tag',
        ]);

        $data = $request->validated();

        $parameter->fill($data);

        if (!$parameter->isDirty()) {
            return ApiResponse::success($parameter, 'No changes.');
        }

        $parameter->save();

        $after = $parameter->fresh()->only([
            'catalog_no',
            'code',
            'name',
            'workflow_group',
            'unit',
            'unit_id',
            'method_ref',
            'status',
            'tag',
        ]);

        $diff = AuditDiffBuilder::fromArrays($before, $after);

        AuditLogger::write(
            action: 'PARAMETER_UPDATED',
            staffId: $staffId,
            entityName: 'parameters',
            entityId: (int) $parameter->parameter_id,
            oldValues: $diff,
            newValues: null
        );

        return ApiResponse::success($parameter->fresh(), 'Parameter updated.');
    }

    public function destroy(Parameter $parameter): JsonResponse
    {
        $this->authorize('delete', $parameter);

        $staffId = (int) (request()->user()?->staff_id ?? 0);

        $before = $parameter->only([
            'parameter_id',
            'catalog_no',
            'code',
            'name',
            'workflow_group',
            'unit',
            'unit_id',
            'method_ref',
            'status',
            'tag',
        ]);

        $parameter->delete();

        AuditLogger::write(
            action: 'PARAMETER_DELETED',
            staffId: $staffId,
            entityName: 'parameters',
            entityId: (int) ($before['parameter_id'] ?? 0),
            oldValues: $before,
            newValues: null
        );

        return ApiResponse::success(null, 'Parameter deleted.');
    }
}
