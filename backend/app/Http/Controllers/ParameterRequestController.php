<?php

namespace App\Http\Controllers;

use App\Http\Requests\ParameterRequestRejectRequest;
use App\Http\Requests\ParameterRequestStoreRequest;
use App\Models\Parameter;
use App\Models\ParameterRequest;
use App\Support\ApiResponse;
use App\Support\AuditDiffBuilder;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ParameterRequestController
 *
 * - Admin/Analyst submit create/update requests.
 * - OM/LH approve/reject.
 * - Requester acknowledges decided requests to "clear" them from their inbox.
 */
class ParameterRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ParameterRequest::class);

        $validated = $request->validate([
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'status' => ['sometimes', 'string', 'max:10'],
            'q' => ['sometimes', 'string', 'max:200'],
        ]);

        $status = $this->normalizeStatus((string) ($validated['status'] ?? ParameterRequest::STATUS_PENDING));
        $q = trim((string) ($validated['q'] ?? ''));
        $perPage = (int) ($validated['per_page'] ?? 20);

        if (!$this->isAllowedStatusFilter($status)) {
            return ApiResponse::error(
                'Invalid status. Allowed: pending, approved, rejected, all',
                'invalid_status',
                422,
                ['resource' => 'parameter_requests']
            );
        }

        $actor = $request->user();
        $actorId = (int) ($actor?->staff_id ?? 0);

        [$isRequesterRole, $isApproverRole] = $this->resolveActorCapabilities($actor);

        $query = ParameterRequest::query()
            ->when($q !== '', function (Builder $qq) use ($q) {
                $this->applyCaseInsensitiveLike($qq, 'parameter_name', $q);
            })
            ->where(function (Builder $qq) use ($status, $isRequesterRole, $actorId) {
                // Approvers: normal status filtering
                if (!$isRequesterRole) {
                    if ($status !== 'all') $qq->where('status', $status);
                    return;
                }

                // Requester inbox behavior:
                // - always show pending
                // - also show decided (approved/rejected) ONLY if:
                //   - requested_by = me
                //   - requester_ack_at is null (belum “centang sudah baca”)
                $includeMyDecidedUnacked = function (Builder $q2) use ($actorId) {
                    $q2->whereIn('status', [ParameterRequest::STATUS_APPROVED, ParameterRequest::STATUS_REJECTED])
                        ->where('requested_by', $actorId)
                        ->whereNull('requester_ack_at');
                };

                if ($status === 'all' || $status === ParameterRequest::STATUS_PENDING) {
                    $qq->where('status', ParameterRequest::STATUS_PENDING)
                        ->orWhere($includeMyDecidedUnacked);
                    return;
                }

                // status=approved / rejected:
                $qq->where('status', $status)
                    ->where('requested_by', $actorId)
                    ->whereNull('requester_ack_at');
            })
            ->orderByDesc('requested_at')
            ->orderByDesc('id');

        return ApiResponse::success(
            data: $query->paginate($perPage),
            message: 'Parameter requests fetched.',
            status: 200,
            extra: [
                'resource' => 'parameter_requests',
                'meta' => [
                    'status' => $status,
                    'q' => $q,
                    'is_requester' => $isRequesterRole,
                    'is_approver' => $isApproverRole,
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

        $targetId = (int) ($data['parameter_id'] ?? 0);

        if ($targetId > 0) {
            return $this->storeUpdateRequest($staffId, $targetId, $data);
        }

        return $this->storeCreateRequest($staffId, $data);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $this->authorize('approve', ParameterRequest::class);

        $actorId = (int) ($request->user()?->staff_id ?? 0);
        if ($actorId <= 0) {
            return ApiResponse::error('Unauthorized.', 'unauthorized', 401, ['resource' => 'parameter_requests']);
        }

        $pre = ParameterRequest::query()->find($id);
        if (!$pre) {
            return ApiResponse::error('Parameter request not found.', 'not_found', 404, ['resource' => 'parameter_requests']);
        }
        if ((string) $pre->status !== ParameterRequest::STATUS_PENDING) {
            return ApiResponse::error('Request already decided.', 'already_decided', 409, [
                'resource' => 'parameter_requests',
                'details' => ['status' => $pre->status],
            ]);
        }

        $result = DB::transaction(function () use ($id, $actorId) {
            $req = ParameterRequest::query()
                ->where('id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) abort(404, 'Parameter request not found.');
            if ((string) $req->status !== ParameterRequest::STATUS_PENDING) abort(409, 'Request already decided.');

            if ((string) $req->request_type === ParameterRequest::TYPE_UPDATE) {
                return $this->approveUpdateRequest($req, $actorId);
            }

            return $this->approveCreateRequest($req, $actorId);
        }, 3);

        return ApiResponse::success(
            data: $result,
            message: 'Approved.',
            status: 200,
            extra: ['resource' => 'parameter_requests']
        );
    }

    public function reject(ParameterRequestRejectRequest $request, int $id): JsonResponse
    {
        $this->authorize('reject', ParameterRequest::class);

        $actorId = (int) ($request->user()?->staff_id ?? 0);
        if ($actorId <= 0) {
            return ApiResponse::error('Unauthorized.', 'unauthorized', 401, ['resource' => 'parameter_requests']);
        }

        $data = $request->validated();
        $note = trim((string) ($data['decision_note'] ?? ''));

        $pre = ParameterRequest::query()->find($id);
        if (!$pre) {
            return ApiResponse::error('Parameter request not found.', 'not_found', 404, ['resource' => 'parameter_requests']);
        }
        if ((string) $pre->status !== ParameterRequest::STATUS_PENDING) {
            return ApiResponse::error('Request already decided.', 'already_decided', 409, [
                'resource' => 'parameter_requests',
                'details' => ['status' => $pre->status],
            ]);
        }

        $result = DB::transaction(function () use ($id, $actorId, $note) {
            $req = ParameterRequest::query()
                ->where('id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) abort(404, 'Parameter request not found.');
            if ((string) $req->status !== ParameterRequest::STATUS_PENDING) abort(409, 'Request already decided.');

            $oldReq = [
                'status' => (string) $req->status,
                'approved_parameter_id' => $req->approved_parameter_id,
                'decided_by' => $req->decided_by,
                'decided_at' => $req->decided_at,
                'decision_note' => $req->decision_note,
            ];

            $req->status = ParameterRequest::STATUS_REJECTED;
            $req->decided_by = $actorId;
            $req->decided_at = now();
            $req->decision_note = $note;
            $req->save();

            AuditLogger::write(
                action: 'PARAMETER_REQUEST_REJECTED',
                staffId: $actorId,
                entityName: 'parameter_requests',
                entityId: (int) $req->id,
                oldValues: $oldReq,
                newValues: [
                    'status' => 'rejected',
                    'request_type' => (string) ($req->request_type ?? ParameterRequest::TYPE_CREATE),
                    'decided_by' => $actorId,
                    'decided_at' => optional($req->decided_at)->toISOString(),
                    'decision_note' => $note,
                ]
            );

            return ['request' => $req->fresh()];
        }, 3);

        return ApiResponse::success(
            data: $result,
            message: 'Rejected.',
            status: 200,
            extra: ['resource' => 'parameter_requests']
        );
    }

    public function acknowledge(Request $request, int $id): JsonResponse
    {
        $this->authorize('viewAny', ParameterRequest::class);

        $actorId = (int) ($request->user()?->staff_id ?? 0);
        if ($actorId <= 0) {
            return ApiResponse::error('Unauthorized.', 'unauthorized', 401, ['resource' => 'parameter_requests']);
        }

        $row = DB::transaction(function () use ($id, $actorId) {
            $req = ParameterRequest::query()
                ->where('id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) abort(404, 'Parameter request not found.');

            // Only the requester can acknowledge
            if ((int) $req->requested_by !== $actorId) {
                abort(403, 'Only the requester can acknowledge this request.');
            }

            // Only decided requests can be acknowledged
            if ((string) $req->status === ParameterRequest::STATUS_PENDING) {
                abort(409, 'Pending request cannot be acknowledged.');
            }

            // Idempotent
            if ($req->requester_ack_at) {
                return $req->fresh();
            }

            $req->requester_ack_at = now();
            $req->save();

            AuditLogger::write(
                action: 'PARAMETER_REQUEST_ACKNOWLEDGED',
                staffId: $actorId,
                entityName: 'parameter_requests',
                entityId: (int) $req->id,
                oldValues: null,
                newValues: [
                    'status' => (string) $req->status,
                    'request_type' => (string) ($req->request_type ?? ParameterRequest::TYPE_CREATE),
                    'requester_ack_at' => optional($req->requester_ack_at)->toISOString(),
                ]
            );

            return $req->fresh();
        }, 3);

        return ApiResponse::success(
            data: ['request' => $row],
            message: 'Acknowledged.',
            status: 200,
            extra: ['resource' => 'parameter_requests']
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    private function normalizeStatus(string $raw): string
    {
        $s = strtolower(trim($raw));
        return $s !== '' ? $s : ParameterRequest::STATUS_PENDING;
    }

    private function isAllowedStatusFilter(string $status): bool
    {
        return in_array($status, [
            ParameterRequest::STATUS_PENDING,
            ParameterRequest::STATUS_APPROVED,
            ParameterRequest::STATUS_REJECTED,
            'all',
        ], true);
    }

    /**
     * Identify whether actor should see requester-style inbox logic.
     * We rely on role name to avoid coupling to role_id mapping.
     */
    private function resolveActorCapabilities($actor): array
    {
        $roleName = strtolower(trim((string) ($actor?->role?->name ?? '')));
        $isRequesterRole = in_array($roleName, ['administrator', 'analyst'], true);
        $isApproverRole = in_array($roleName, ['operational manager', 'lab head'], true);

        return [$isRequesterRole, $isApproverRole];
    }

    /**
     * Apply case-insensitive LIKE that works on both PostgreSQL and MySQL.
     */
    private function applyCaseInsensitiveLike(Builder $q, string $column, string $needle): void
    {
        $needle = trim((string) $needle);
        if ($needle === '') return;

        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            $q->where($column, 'ilike', '%' . $needle . '%');
            return;
        }

        $q->whereRaw('LOWER(' . $column . ') LIKE ?', ['%' . strtolower($needle) . '%']);
    }

    private function storeUpdateRequest(int $staffId, int $targetId, array $data): JsonResponse
    {
        $param = Parameter::query()->find($targetId);
        if (!$param) {
            return ApiResponse::error('Parameter not found.', 'not_found', 404, ['resource' => 'parameter_requests']);
        }

        $payload = $this->buildUpdatePayload($data);

        if (!$payload) {
            return ApiResponse::error('No changes submitted.', 'no_changes', 422, ['resource' => 'parameter_requests']);
        }

        $displayName = array_key_exists('name', $payload) ? (string) $payload['name'] : (string) $param->name;

        // category here is only for list display; do NOT treat it as canonical.
        $displayCategory = array_key_exists('workflow_group', $payload)
            ? ((string) ($payload['workflow_group'] ?? '') ?: (string) ($param->workflow_group ?? 'microbiology'))
            : (string) ($param->workflow_group ?? 'microbiology');

        $row = ParameterRequest::create([
            'request_type' => ParameterRequest::TYPE_UPDATE,
            'parameter_id' => (int) $param->parameter_id,
            'payload' => $payload,

            'parameter_name' => $displayName,
            'category' => $displayCategory,
            'reason' => $data['reason'] ?? null,

            'status' => ParameterRequest::STATUS_PENDING,
            'requested_by' => $staffId,
            'requested_at' => now(),
        ]);

        $before = $param->only(['name', 'workflow_group', 'status', 'tag']);
        $after = [
            'name' => $payload['name'] ?? $param->name,
            'workflow_group' => array_key_exists('workflow_group', $payload) ? $payload['workflow_group'] : $param->workflow_group,
            'status' => $payload['status'] ?? $param->status,
            'tag' => $payload['tag'] ?? $param->tag,
        ];

        AuditLogger::write(
            action: 'PARAMETER_UPDATE_REQUEST_SUBMITTED',
            staffId: $staffId,
            entityName: 'parameter_requests',
            entityId: (int) $row->id,
            oldValues: AuditDiffBuilder::fromArrays($before, $after),
            newValues: [
                'request_type' => ParameterRequest::TYPE_UPDATE,
                'parameter_id' => (int) $param->parameter_id,
                'payload' => $payload,
            ]
        );

        return ApiResponse::success(
            data: $row,
            message: 'Parameter update request submitted.',
            status: 201,
            extra: ['resource' => 'parameter_requests']
        );
    }

    private function buildUpdatePayload(array $data): array
    {
        $payload = [];

        if (array_key_exists('name', $data)) $payload['name'] = trim((string) $data['name']);
        if (array_key_exists('workflow_group', $data)) $payload['workflow_group'] = $data['workflow_group'];
        if (array_key_exists('status', $data)) $payload['status'] = $data['status'];
        if (array_key_exists('tag', $data)) $payload['tag'] = $data['tag'];

        return $payload;
    }

    private function storeCreateRequest(int $staffId, array $data): JsonResponse
    {
        $category = strtolower(trim((string) ($data['category'] ?? 'microbiology')));
        if ($category === '') $category = 'microbiology';

        $row = ParameterRequest::create([
            'request_type' => ParameterRequest::TYPE_CREATE,
            'parameter_id' => null,
            'payload' => null,

            'parameter_name' => trim((string) $data['parameter_name']),
            'category' => $category,
            'reason' => $data['reason'] ?? null,

            'status' => ParameterRequest::STATUS_PENDING,
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
                'request_type' => ParameterRequest::TYPE_CREATE,
                'parameter_name' => $row->parameter_name,
                'category' => $row->category,
                'reason' => $row->reason,
                'status' => $row->status,
            ]
        );

        return ApiResponse::success(
            data: $row,
            message: 'Parameter request submitted.',
            status: 201,
            extra: ['resource' => 'parameter_requests']
        );
    }

    private function approveUpdateRequest(ParameterRequest $req, int $actorId): array
    {
        $param = Parameter::query()
            ->where('parameter_id', (int) $req->parameter_id)
            ->lockForUpdate()
            ->first();

        if (!$param) abort(404, 'Target parameter not found.');

        $before = $param->only(['name', 'workflow_group', 'status', 'tag']);
        $payload = is_array($req->payload) ? $req->payload : [];

        $apply = [];
        foreach (['name', 'workflow_group', 'status', 'tag'] as $key) {
            if (array_key_exists($key, $payload)) $apply[$key] = $payload[$key];
        }

        $param->fill($apply);
        if ($param->isDirty()) $param->save();

        $after = $param->fresh()->only(['name', 'workflow_group', 'status', 'tag']);
        $diff = AuditDiffBuilder::fromArrays($before, $after);

        $oldReq = [
            'status' => (string) $req->status,
            'decided_by' => $req->decided_by,
            'decided_at' => $req->decided_at,
        ];

        $req->status = ParameterRequest::STATUS_APPROVED;
        $req->decided_by = $actorId;
        $req->decided_at = now();
        $req->approved_parameter_id = (int) $param->parameter_id;
        $req->save();

        AuditLogger::write(
            action: 'PARAMETER_UPDATE_REQUEST_APPROVED',
            staffId: $actorId,
            entityName: 'parameter_requests',
            entityId: (int) $req->id,
            oldValues: $oldReq,
            newValues: [
                'status' => ParameterRequest::STATUS_APPROVED,
                'request_type' => ParameterRequest::TYPE_UPDATE,
                'parameter_id' => (int) $param->parameter_id,
            ]
        );

        AuditLogger::write(
            action: 'PARAMETER_UPDATED_FROM_REQUEST',
            staffId: $actorId,
            entityName: 'parameters',
            entityId: (int) $param->parameter_id,
            oldValues: $diff,
            newValues: null
        );

        return ['request' => $req->fresh(), 'parameter' => $param->fresh()];
    }

    private function approveCreateRequest(ParameterRequest $req, int $actorId): array
    {
        $seq = DB::table('parameter_code_sequences')
            ->where('name', 'parameter')
            ->lockForUpdate()
            ->first();

        if (!$seq) {
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

        DB::table('parameter_code_sequences')
            ->where('id', (int) $seq->id)
            ->update(['next_number' => $nextNo + 1, 'updated_at' => now()]);

        $code = 'P' . str_pad((string) $nextNo, 2, '0', STR_PAD_LEFT);

        $unitText = 'sampel';
        $methodRef = 'Requested parameter (method ref TBD)';

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

        $param = Parameter::create([
            'catalog_no' => $nextNo,
            'workflow_group' => (string) $req->category,
            'code' => $code,
            'name' => (string) $req->parameter_name,
            'unit' => $unitText,
            'unit_id' => $unitId,
            'method_ref' => $methodRef,
            'created_by' => (int) $req->requested_by,
            'status' => 'Active',
            'tag' => 'Routine',
        ]);

        $req->status = ParameterRequest::STATUS_APPROVED;
        $req->decided_by = $actorId;
        $req->decided_at = now();
        $req->approved_parameter_id = (int) $param->parameter_id;
        $req->save();

        AuditLogger::write(
            action: 'PARAMETER_REQUEST_APPROVED',
            staffId: $actorId,
            entityName: 'parameter_requests',
            entityId: (int) $req->id,
            oldValues: $oldReq,
            newValues: [
                'status' => ParameterRequest::STATUS_APPROVED,
                'decided_by' => $actorId,
                'decided_at' => optional($req->decided_at)->toISOString(),
                'approved_parameter_id' => (int) $param->parameter_id,
                'parameter_code' => $code,
                'catalog_no' => $nextNo,
                'workflow_group' => (string) $req->category,
            ]
        );

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

        return ['request' => $req->fresh(), 'parameter' => $param->fresh()];
    }
}
