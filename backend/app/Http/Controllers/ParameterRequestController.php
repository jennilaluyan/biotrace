<?php

namespace App\Http\Controllers;

use App\Http\Requests\ParameterRequestStoreRequest;
use App\Models\ParameterRequest;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Models\Parameter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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

    public function approve(Request $request, int $id): JsonResponse
    {
        $this->authorize('approve', \App\Models\ParameterRequest::class);

        /** @var \App\Models\Staff|null $actor */
        $actor = $request->user();
        $actorId = (int) ($actor?->staff_id ?? 0);
        if ($actorId <= 0) {
            return ApiResponse::error('Unauthorized.', 'unauthorized', 401, ['resource' => 'parameter_requests']);
        }

        // quick precheck for consistent 404/409 response
        $pre = \App\Models\ParameterRequest::query()->find($id);
        if (!$pre) {
            return ApiResponse::error('Parameter request not found.', 'not_found', 404, ['resource' => 'parameter_requests']);
        }
        if ((string) $pre->status !== 'pending') {
            return ApiResponse::error('Request already decided.', 'already_decided', 409, [
                'resource' => 'parameter_requests',
                'details' => ['status' => $pre->status],
            ]);
        }

        $result = DB::transaction(function () use ($id, $actorId) {
            $req = \App\Models\ParameterRequest::query()
                ->where('id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) {
                abort(404, 'Parameter request not found.');
            }
            if ((string) $req->status !== 'pending') {
                abort(409, 'Request already decided.');
            }

            // lock sequence row (concurrency-safe)
            $seq = DB::table('parameter_code_sequences')
                ->where('name', 'parameter')
                ->lockForUpdate()
                ->first();

            if (!$seq) {
                // should not happen if migration ran, but keep it safe
                DB::table('parameter_code_sequences')->insert([
                    'name' => 'parameter',
                    'next_number' => 33,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $seq = DB::table('parameter_code_sequences')
                    ->where('name', 'parameter')
                    ->lockForUpdate()
                    ->first();
            }

            $nextNo = (int) ($seq->next_number ?? 33);
            if ($nextNo < 33) $nextNo = 33;

            // allocate
            DB::table('parameter_code_sequences')
                ->where('id', (int) $seq->id)
                ->update([
                    'next_number' => $nextNo + 1,
                    'updated_at' => now(),
                ]);

            $code = 'P' . str_pad((string) $nextNo, 2, '0', STR_PAD_LEFT);

            // Required by schema: unit + method_ref are NOT NULL
            $unitText = 'sampel';
            $methodRef = 'Requested parameter (method ref TBD)';

            // best-effort: unit_id if units table exists and column exists
            $unitId = null;
            try {
                if (Schema::hasColumn('parameters', 'unit_id') && Schema::hasTable('units')) {
                    $unitId = DB::table('units')
                        ->whereRaw('LOWER(name) = ?', ['sampel'])
                        ->orWhereRaw('LOWER(symbol) = ?', ['sampel'])
                        ->value('unit_id');
                }
            } catch (\Throwable $e) {
                $unitId = null;
            }

            $oldReq = [
                'status' => (string) $req->status,
                'approved_parameter_id' => $req->approved_parameter_id,
                'decided_by' => $req->decided_by,
                'decided_at' => $req->decided_at,
            ];

            // create parameter
            $param = Parameter::create([
                'catalog_no' => $nextNo,
                'workflow_group' => (string) $req->category, // pcr|sequencing|rapid|microbiology
                'code' => $code,
                'name' => (string) $req->parameter_name,
                'unit' => $unitText,
                'unit_id' => $unitId,
                'method_ref' => $methodRef,
                'created_by' => (int) $req->requested_by, // who proposed (traceability)
                'status' => 'Active',
                'tag' => 'Routine',
            ]);

            // mark request approved
            $req->status = 'approved';
            $req->decided_by = $actorId;
            $req->decided_at = now();
            $req->approved_parameter_id = (int) $param->parameter_id;
            $req->save();

            // audit: request approved
            AuditLogger::write(
                action: 'PARAMETER_REQUEST_APPROVED',
                staffId: $actorId,
                entityName: 'parameter_requests',
                entityId: (int) $req->id,
                oldValues: $oldReq,
                newValues: [
                    'status' => 'approved',
                    'decided_by' => $actorId,
                    'decided_at' => optional($req->decided_at)->toISOString(),
                    'approved_parameter_id' => (int) $param->parameter_id,
                    'parameter_code' => $code,
                    'catalog_no' => $nextNo,
                    'workflow_group' => (string) $req->category,
                ]
            );

            // audit: parameter created
            AuditLogger::write(
                action: 'PARAMETER_CREATED_FROM_REQUEST',
                staffId: $actorId,
                entityName: 'parameters',
                entityId: (int) $param->parameter_id,
                oldValues: null,
                newValues: [
                    'source_request_id' => (int) $req->id,
                    'code' => $code,
                    'catalog_no' => $nextNo,
                    'name' => (string) $req->parameter_name,
                    'workflow_group' => (string) $req->category,
                    'status' => 'Active',
                    'tag' => 'Routine',
                ]
            );

            return [
                'request' => $req->fresh(),
                'parameter' => $param->fresh(),
            ];
        }, 3);

        return ApiResponse::success(
            data: $result,
            message: 'Approved.',
            status: 200,
            extra: ['resource' => 'parameter_requests']
        );
    }
}