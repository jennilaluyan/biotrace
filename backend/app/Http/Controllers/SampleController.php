<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleStatusUpdateRequest;
use App\Http\Requests\SampleStoreRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\SampleStatusTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Support\AuditLogger;
use App\Enums\SampleHighLevelStatus;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SampleController extends Controller
{
    public function __construct()
    {
        $this->authorizeResource(Sample::class, 'sample');
    }

    public function index(Request $request): JsonResponse
    {
        $query = Sample::query()
            ->with(['client', 'creator', 'assignee', 'requestedParameters']);

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('status_enum')) {
            $raw = strtolower($request->get('status_enum'));
            $enum = SampleHighLevelStatus::tryFrom($raw);
            if ($enum) {
                $query->whereIn('current_status', $enum->currentStatuses());
            }
        }

        if ($request->filled('from')) {
            $query->whereDate('received_at', '>=', $request->get('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('received_at', '<=', $request->get('to'));
        }

        $samples = $query->orderByDesc('received_at')->paginate(15);

        return response()->json([
            'data' => $samples->items(),
            'meta' => [
                'current_page' => $samples->currentPage(),
                'last_page' => $samples->lastPage(),
                'per_page' => $samples->perPage(),
                'total' => $samples->total(),
            ],
        ]);
    }

    private function syncRequestedParameters(Sample $sample, array $parameterIds): void
    {
        if (!Schema::hasTable('sample_requested_parameters')) return;
        if (!method_exists($sample, 'requestedParameters')) return;

        $ids = array_values(array_unique(array_map('intval', $parameterIds)));
        $sample->requestedParameters()->sync($ids);
    }

    public function store(SampleStoreRequest $request): JsonResponse
    {
        $data = $request->validated();

        $data['current_status'] = 'received';

        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json([
                'message' => 'Authenticated staff not found.',
            ], 500);
        }

        $data['created_by'] = $staff->staff_id;

        if (
            array_key_exists('assigned_to', $data)
            && $data['assigned_to'] !== null
            && (int) $data['assigned_to'] !== (int) $staff->staff_id
        ) {
            $this->authorize('overrideAssigneeOnCreate', Sample::class);
        }

        $data['assigned_to'] = $data['assigned_to'] ?? $staff->staff_id;

        if (!empty($data['received_at'])) {
            $data['received_at'] = Carbon::parse((string) $data['received_at']);
        }

        // separate: parameter_ids goes to pivot, not samples table
        $parameterIds = $data['parameter_ids'] ?? [];
        unset($data['parameter_ids']);

        $sample = Sample::create($data);

        $this->syncRequestedParameters($sample, $parameterIds);

        $sample->load(['client', 'creator', 'assignee', 'requestedParameters']);

        AuditLogger::logSampleRegistered(
            staffId: $staff->staff_id,
            sampleId: $sample->sample_id,
            clientId: $sample->client_id,
            newValues: $sample->toArray(),
        );

        return response()->json([
            'message' => 'Sample registered successfully.',
            'data' => $sample,
        ], 201);
    }

    public function show(Sample $sample): JsonResponse
    {
        $sample->load(['client', 'creator', 'assignee', 'requestedParameters']);
        return response()->json([
            'data' => $sample,
        ]);
    }

    public function updateStatus(SampleStatusUpdateRequest $request, Sample $sample): JsonResponse
    {
        if (Schema::hasColumn('samples', 'request_status')) {
            if (($sample->request_status ?? null) !== 'physically_received') {
                return response()->json([
                    'message' => 'Sample belum diterima fisik oleh lab. Tidak boleh masuk lab workflow.',
                    'errors' => [
                        'request_status' => [$sample->request_status ?? null],
                    ],
                ], 422);
            }
        }

        /** @var Staff $staff */
        $staff = Auth::user();
        $targetStatus = $request->input('target_status');
        $note = $request->input('note');

        if (!$staff instanceof Staff) {
            return response()->json([
                'message' => 'Authenticated staff not found.',
            ], 500);
        }

        if ($sample->current_status === $targetStatus) {
            return response()->json([
                'message' => 'Sample already in the requested status.',
            ], 400);
        }

        if (!SampleStatusTransitions::canTransition($staff, $sample, $targetStatus)) {
            return response()->json([
                'message' => 'You are not allowed to perform this status transition.',
            ])->setStatusCode(403);
        }

        $oldStatus = $sample->current_status;
        $sample->current_status = $targetStatus;
        $sample->save();

        $sample->refresh()->load(['client', 'creator', 'assignee', 'requestedParameters']);

        AuditLogger::logSampleStatusChanged(
            staffId: $staff->staff_id,
            sampleId: $sample->sample_id,
            clientId: $sample->client_id,
            oldStatus: $oldStatus,
            newStatus: $targetStatus,
            note: $note,
        );

        return response()->json([
            'message' => 'Sample status updated successfully.',
            'data' => $sample,
        ]);
    }
}