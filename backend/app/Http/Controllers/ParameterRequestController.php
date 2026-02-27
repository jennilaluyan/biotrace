<?php

namespace App\Http\Controllers;

use App\Http\Requests\ParameterRequestStoreRequest;
use App\Models\ParameterRequest;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;

class ParameterRequestController extends Controller
{
    public function store(ParameterRequestStoreRequest $request): JsonResponse
    {
        $this->authorize('create', ParameterRequest::class);

        $staff = $request->user();
        $staffId = (int) ($staff?->staff_id ?? 0);

        $data = $request->validated();

        // Default category (keep deterministic)
        $category = strtolower(trim((string) ($data['category'] ?? 'microbiology')));
        if ($category === '') $category = 'microbiology';

        $row = ParameterRequest::create([
            'parameter_name' => trim((string) $data['parameter_name']),
            'category' => $category,
            'reason' => $data['reason'] ?? null,
            'status' => 'pending',
            'requested_by' => $staffId,
            'requested_at' => now(),
        ]);

        // Audit log (must be uppercase + underscore only)
        AuditLogger::write(
            action: 'PARAMETER_REQUEST_SUBMITTED',
            staffId: $staffId,
            entityName: 'parameter_requests',
            entityId: (int) $row->id,
            oldValues: null,
            newValues: [
                'parameter_name' => $row->parameter_name,
                'category' => $row->category,
                'reason' => $row->reason,
                'status' => $row->status,
            ]
        );

        return ApiResponse::success(
            $row,
            'Parameter request submitted.',
            201,
            ['resource' => 'parameter_requests']
        );
    }
}