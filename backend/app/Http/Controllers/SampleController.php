<?php

namespace App\Http\Controllers;

use App\Enums\SampleHighLevelStatus;
use App\Http\Requests\SampleStatusUpdateRequest;
use App\Http\Requests\SampleStoreRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\AuditLogger;
use App\Support\SampleStatusTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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

        // Filter out requests: lab samples must have lab_sample_code
        if (Schema::hasColumn('samples', 'lab_sample_code')) {
            $query->whereNotNull('lab_sample_code');
        }

        // Step 1: Samples page shows only samples that are already in lab workflow OR already included in an LOO.
        // - In-Lab workflow: has current_status (manual/legacy samples)
        // - From waiting room: becomes visible only after it is included in letter_of_order_items
        $hasLooItems = Schema::hasTable('letter_of_order_items') && Schema::hasColumn('letter_of_order_items', 'sample_id');
        $hasCurrentStatus = Schema::hasColumn('samples', 'current_status');

        if ($hasLooItems) {
            $query->where(function ($w) use ($hasCurrentStatus) {
                if ($hasCurrentStatus) {
                    $w->whereNotNull('current_status');
                }

                $w->orWhereExists(function ($sub) {
                    $sub->selectRaw('1')
                        ->from('letter_of_order_items as loi')
                        ->whereColumn('loi.sample_id', 'samples.sample_id');
                });
            });
        }

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('status_enum')) {
            $raw = strtolower((string) $request->get('status_enum'));
            $enum = SampleHighLevelStatus::tryFrom($raw);
            if ($enum) {
                $query->whereIn('current_status', $enum->currentStatuses());
            }
        }

        // Keep legacy date filters (only meaningful for lab samples)
        if ($request->filled('from')) {
            $query->whereDate('received_at', '>=', $request->get('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('received_at', '<=', $request->get('to'));
        }

        // Prefer stable ordering even if received_at is null
        $samples = $query
            ->orderByDesc('received_at')
            ->orderByDesc('sample_id')
            ->paginate(15);

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
        /**
         * ✅ Gate lab workflow:
         * - Prefer physical workflow marker admin_received_from_client_at (more correct)
         * - Fallback: request_status must be physically_received
         */
        if (Schema::hasColumn('samples', 'admin_received_from_client_at')) {
            if (empty($sample->admin_received_from_client_at)) {
                return response()->json([
                    'message' => 'Sample belum diterima oleh admin dari client (physical workflow belum mulai).',
                    'errors' => [
                        'admin_received_from_client_at' => [null],
                    ],
                ], 422);
            }
        } elseif (Schema::hasColumn('samples', 'request_status')) {
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
