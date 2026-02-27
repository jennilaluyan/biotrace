<?php

namespace App\Http\Controllers;

use App\Http\Requests\ParameterRequestStoreRequest;
use App\Models\ParameterRequest;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ParameterRequestController extends Controller
{
    /**
     * GET /v1/parameter-requests
     * Visible to all staff except Sample Collector.
     *
     * Query:
     * - status: pending|approved|rejected|all (default: pending)
     * - q: search by parameter_name
     * - page, per_page
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ParameterRequest::class);

        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'status' => ['sometimes', 'string', 'max:10'],
            'q' => ['sometimes', 'string', 'max:200'],
        ]);

        $status = strtolower(trim((string) ($validated['status'] ?? 'pending')));
        $q = trim((string) ($validated['q'] ?? ''));
        $perPage = (int) ($validated['per_page'] ?? 20);

        $allowed = ['pending', 'approved', 'rejected', 'all'];
        if (!in_array($status, $allowed, true)) {
            return ApiResponse::error(
                'Invalid status. Allowed: pending, approved, rejected, all',
                'invalid_status',
                422,
                ['resource' => 'parameter_requests']
            );
        }

        $query = ParameterRequest::query()
            ->when($status !== 'all', fn($qq) => $qq->where('status', $status))
            ->when($q !== '', function ($qq) use ($q) {
                $qq->where('parameter_name', 'ilike', '%' . $q . '%');
            })
            ->orderByDesc('requested_at')
            ->orderByDesc('id');

        $paged = $query->paginate($perPage);

        return ApiResponse::success(
            data: $paged,
            message: 'Parameter requests fetched.',
            status: 200,
            extra: [
                'resource' => 'parameter_requests',
                'meta' => [
                    'status' => $status,
                    'q' => $q,
                ],
            ]
        );
    }

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