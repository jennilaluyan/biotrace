<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleIdChangeApproveRequest;
use App\Http\Requests\SampleIdChangeRejectRequest;
use App\Models\SampleIdChangeRequest;
use App\Models\Staff;
use App\Services\SampleIdService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SampleIdChangeRequestController extends Controller
{
    public function __construct(private readonly SampleIdService $svc) {}

    private function assertOmOrLhOr403(Staff $actor): void
    {
        $role = strtolower(trim((string) ($actor->role?->name ?? '')));

        $isOm =
            str_contains($role, 'operational manager') ||
            $role === 'om' ||
            str_contains($role, 'operational_manager');

        $isLh =
            str_contains($role, 'laboratory head') ||
            str_contains($role, 'lab head') ||
            $role === 'lh' ||
            str_contains($role, 'laboratory_head') ||
            str_contains($role, 'lab_head');

        if (!$isOm && !$isLh) {
            abort(403, 'Forbidden.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->assertOmOrLhOr403($actor);

        $status = strtoupper(trim((string) $request->get('status', 'PENDING')));
        if (!in_array($status, ['PENDING', 'APPROVED', 'REJECTED'], true)) {
            $status = 'PENDING';
        }

        $rows = SampleIdChangeRequest::query()
            ->with(['sample.client', 'requestedBy', 'reviewedBy'])
            ->where('status', $status)
            ->orderByDesc('change_request_id')
            ->paginate(15);

        $items = collect($rows->items())->map(function ($r) {
            return [
                'change_request_id' => (int) $r->change_request_id,
                'status' => $r->status,
                'sample_id' => (int) $r->sample_id,
                'suggested_sample_id' => $r->suggested_sample_id,
                'proposed_sample_id' => $r->proposed_sample_id,
                'requested_by' => $r->requestedBy ? [
                    'staff_id' => (int) $r->requestedBy->staff_id,
                    'name' => $r->requestedBy->name,
                    'email' => $r->requestedBy->email,
                ] : null,
                'reviewed_by' => $r->reviewedBy ? [
                    'staff_id' => (int) $r->reviewedBy->staff_id,
                    'name' => $r->reviewedBy->name,
                    'email' => $r->reviewedBy->email,
                ] : null,
                'review_note' => $r->review_note,
                'sample' => $r->sample ? [
                    'sample_id' => (int) $r->sample->sample_id,
                    'request_status' => $r->sample->request_status,
                    'workflow_group' => $r->sample->workflow_group,
                    'lab_sample_code' => $r->sample->lab_sample_code,
                    'client' => $r->sample->client ? [
                        'client_id' => (int) $r->sample->client->client_id,
                        'name' => $r->sample->client->name,
                        'email' => $r->sample->client->email,
                    ] : null,
                ] : null,
                'created_at' => $r->created_at,
                'updated_at' => $r->updated_at,
            ];
        })->values()->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
        ], 200);
    }

    public function show(int $changeRequestId): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->assertOmOrLhOr403($actor);

        $r = SampleIdChangeRequest::query()
            ->with(['sample.client', 'requestedBy', 'reviewedBy'])
            ->findOrFail($changeRequestId);

        return response()->json([
            'data' => [
                'change_request_id' => (int) $r->change_request_id,
                'status' => $r->status,
                'sample_id' => (int) $r->sample_id,
                'suggested_sample_id' => $r->suggested_sample_id,
                'proposed_sample_id' => $r->proposed_sample_id,
                'requested_by' => $r->requestedBy ? [
                    'staff_id' => (int) $r->requestedBy->staff_id,
                    'name' => $r->requestedBy->name,
                    'email' => $r->requestedBy->email,
                ] : null,
                'reviewed_by' => $r->reviewedBy ? [
                    'staff_id' => (int) $r->reviewedBy->staff_id,
                    'name' => $r->reviewedBy->name,
                    'email' => $r->reviewedBy->email,
                ] : null,
                'review_note' => $r->review_note,
                'sample' => $r->sample ? [
                    'sample_id' => (int) $r->sample->sample_id,
                    'request_status' => $r->sample->request_status,
                    'workflow_group' => $r->sample->workflow_group,
                    'lab_sample_code' => $r->sample->lab_sample_code,
                    'verified_at' => $r->sample->verified_at,
                    'client' => $r->sample->client ? [
                        'client_id' => (int) $r->sample->client->client_id,
                        'name' => $r->sample->client->name,
                        'email' => $r->sample->client->email,
                    ] : null,
                ] : null,
                'created_at' => $r->created_at,
                'updated_at' => $r->updated_at,
            ],
        ], 200);
    }

    public function approve(SampleIdChangeApproveRequest $request, int $changeRequestId): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->assertOmOrLhOr403($actor);

        $note = $request->validated()['note'] ?? null;

        $cr = SampleIdChangeRequest::query()->findOrFail($changeRequestId);

        try {
            $updated = $this->svc->approveChange($actor, $cr, is_string($note) ? $note : null);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'change_request_id' => (int) $updated->change_request_id,
                'status' => $updated->status,
                'reviewed_by_staff_id' => (int) ($updated->reviewed_by_staff_id ?? 0),
                'review_note' => $updated->review_note,
                'updated_at' => $updated->updated_at,
            ],
        ], 200);
    }

    public function reject(SampleIdChangeRejectRequest $request, int $changeRequestId): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->assertOmOrLhOr403($actor);

        $note = (string) $request->validated()['note'];

        $cr = SampleIdChangeRequest::query()->findOrFail($changeRequestId);

        try {
            $updated = $this->svc->rejectChange($actor, $cr, $note);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'change_request_id' => (int) $updated->change_request_id,
                'status' => $updated->status,
                'reviewed_by_staff_id' => (int) ($updated->reviewed_by_staff_id ?? 0),
                'review_note' => $updated->review_note,
                'updated_at' => $updated->updated_at,
            ],
        ], 200);
    }

    public function latestBySample(Request $request, int $sampleId): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->assertOmOrLhOr403($actor);

        $status = strtoupper(trim((string) $request->get('status', 'PENDING')));
        if (!in_array($status, ['PENDING', 'APPROVED', 'REJECTED'], true)) {
            $status = 'PENDING';
        }

        $r = SampleIdChangeRequest::query()
            ->with(['sample.client', 'requestedBy', 'reviewedBy'])
            ->where('sample_id', $sampleId)
            ->where('status', $status)
            ->orderByDesc('change_request_id')
            ->first();

        if (!$r) {
            return response()->json(['data' => null], 200);
        }

        return response()->json([
            'data' => [
                'change_request_id' => (int) $r->change_request_id,
                'status' => $r->status,
                'sample_id' => (int) $r->sample_id,

                // ✅ alias biar FE gampang
                'suggested_sample_id' => $r->suggested_sample_id,
                'suggested_lab_sample_code' => $r->suggested_sample_id,
                'proposed_sample_id' => $r->proposed_sample_id,
                'proposed_lab_sample_code' => $r->proposed_sample_id,

                'client_name' => $r->sample?->client?->name,
                'client_email' => $r->sample?->client?->email,
                'workflow_group' => $r->sample?->workflow_group,

                'created_at' => $r->created_at,
                'updated_at' => $r->updated_at,
            ],
        ], 200);
    }
}
