<?php

namespace App\Http\Controllers;

use App\Enums\SampleHighLevelStatus;
use App\Http\Requests\SampleStatusUpdateRequest;
use App\Http\Requests\SampleStoreRequest;
use App\Models\Parameter;
use App\Models\Sample;
use App\Models\Staff;
use App\Services\WorkflowGroupResolver;
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
            ->select('samples.*')
            ->with(['client', 'creator', 'assignee', 'requestedParameters']);

        if (Schema::hasColumn('samples', 'lab_sample_code')) {
            $query->whereNotNull('samples.lab_sample_code');
        }

        $hasLooItems =
            Schema::hasTable('letter_of_order_items') &&
            Schema::hasColumn('letter_of_order_items', 'sample_id') &&
            Schema::hasColumn('letter_of_order_items', 'lo_id');

        $hasLoTable =
            Schema::hasTable('letters_of_order') &&
            Schema::hasColumn('letters_of_order', 'lo_id');

        $hasReagentRequests =
            Schema::hasTable('reagent_requests') &&
            Schema::hasColumn('reagent_requests', 'reagent_request_id') &&
            Schema::hasColumn('reagent_requests', 'lo_id') &&
            Schema::hasColumn('reagent_requests', 'status');

        if ($hasLooItems) {
            $loMap = DB::table('letter_of_order_items')
                ->selectRaw('sample_id, MAX(lo_id) as lo_id')
                ->groupBy('sample_id');

            $query->leftJoinSub($loMap, 'lo_map', function ($join) {
                $join->on('lo_map.sample_id', '=', 'samples.sample_id');
            });

            if ($hasLoTable) {
                $query->leftJoin('letters_of_order as lo', 'lo.lo_id', '=', 'lo_map.lo_id');
            }

            if ($hasReagentRequests) {
                $rrMap = DB::table('reagent_requests')
                    ->selectRaw('lo_id, MAX(reagent_request_id) as reagent_request_id')
                    ->groupBy('lo_id');

                $query->leftJoinSub($rrMap, 'rr_map', function ($join) {
                    $join->on('rr_map.lo_id', '=', 'lo_map.lo_id');
                });

                $query->leftJoin('reagent_requests as rr', 'rr.reagent_request_id', '=', 'rr_map.reagent_request_id');
            }

            $query->addSelect([
                DB::raw('lo_map.lo_id as lo_id'),
                DB::raw($hasLoTable ? 'lo.number as lo_number' : 'NULL as lo_number'),
                DB::raw($hasLoTable ? 'lo.generated_at as lo_generated_at' : 'NULL as lo_generated_at'),
                DB::raw($hasReagentRequests ? 'rr.reagent_request_id as reagent_request_id' : 'NULL as reagent_request_id'),
                DB::raw($hasReagentRequests ? 'rr.status as reagent_request_status' : 'NULL as reagent_request_status'),
            ]);
        }

        $hasLooItemsExists = Schema::hasTable('letter_of_order_items') && Schema::hasColumn('letter_of_order_items', 'sample_id');
        $hasCurrentStatus = Schema::hasColumn('samples', 'current_status');
        $hasRequestStatus = Schema::hasColumn('samples', 'request_status');

        $query->where(function ($w) use ($hasCurrentStatus, $hasLooItemsExists, $hasRequestStatus) {
            $any = false;

            if ($hasCurrentStatus) {
                if ($hasRequestStatus) {
                    $w->where(function ($qq) {
                        $qq->whereNull('request_status')
                            ->whereNotNull('current_status');
                    });
                } else {
                    $w->whereNotNull('current_status');
                }

                $any = true;
            }

            if ($hasLooItemsExists) {
                if ($any) {
                    $w->orWhereExists(function ($sub) {
                        $sub->selectRaw('1')
                            ->from('letter_of_order_items as loi')
                            ->whereColumn('loi.sample_id', 'samples.sample_id');
                    });
                } else {
                    $w->whereExists(function ($sub) {
                        $sub->selectRaw('1')
                            ->from('letter_of_order_items as loi')
                            ->whereColumn('loi.sample_id', 'samples.sample_id');
                    });
                }
            }
        });

        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        if ($request->filled('request_batch_id') && Schema::hasColumn('samples', 'request_batch_id')) {
            $query->where('samples.request_batch_id', (string) $request->get('request_batch_id'));
        }

        if ($request->filled('status_enum')) {
            $raw = strtolower((string) $request->get('status_enum'));
            $enum = SampleHighLevelStatus::tryFrom($raw);

            if ($enum) {
                $query->whereIn('current_status', $enum->currentStatuses());
            }
        }

        $includeReported = filter_var((string) $request->query('include_reported', '0'), FILTER_VALIDATE_BOOLEAN);

        if ($hasCurrentStatus && !$includeReported && !$request->filled('status_enum')) {
            $query->where(function ($w) {
                $w->whereNull('samples.current_status')
                    ->orWhere('samples.current_status', '!=', 'reported');
            });
        }

        $includeExcluded = filter_var((string) $request->query('include_excluded', '0'), FILTER_VALIDATE_BOOLEAN);

        if (
            Schema::hasColumn('samples', 'batch_excluded_at') &&
            !$includeExcluded
        ) {
            $query->whereNull('samples.batch_excluded_at');
        }

        if ($request->filled('from')) {
            $query->whereDate('samples.received_at', '>=', $request->get('from'));
        }

        if ($request->filled('to')) {
            $query->whereDate('samples.received_at', '<=', $request->get('to'));
        }

        $samples = $query
            ->orderByDesc('samples.received_at')
            ->orderByDesc('samples.sample_id')
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
        $parameterIds = array_values(array_unique(array_map('intval', $parameterIds)));
        $sample->requestedParameters()->sync($parameterIds);

        $oldGroup = $sample->workflow_group;
        $resolved = (new WorkflowGroupResolver())->resolveFromParameterIds($parameterIds);
        $newGroup = $resolved?->value;

        if ($newGroup !== $oldGroup) {
            $sample->workflow_group = $newGroup;
            $sample->save();

            /** @var Staff|null $staff */
            $staff = Auth::user();

            AuditLogger::logWorkflowGroupChanged(
                staffId: $staff instanceof Staff ? (int) $staff->staff_id : null,
                sampleId: (int) $sample->sample_id,
                clientId: (int) $sample->client_id,
                oldGroup: $oldGroup,
                newGroup: $newGroup,
                parameterIds: $parameterIds,
            );
        }
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
            array_key_exists('assigned_to', $data) &&
            $data['assigned_to'] !== null &&
            (int) $data['assigned_to'] !== (int) $staff->staff_id
        ) {
            $this->authorize('overrideAssigneeOnCreate', Sample::class);
        }

        $data['assigned_to'] = $data['assigned_to'] ?? $staff->staff_id;

        if (!empty($data['received_at'])) {
            $data['received_at'] = Carbon::parse((string) $data['received_at']);
        }

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

    public function show(Request $request, Sample $sample): JsonResponse
    {
        $sample->load(['client', 'creator', 'assignee', 'requestedParameters', 'intakeChecklist.checker']);

        $includeBatch = filter_var((string) $request->query('include_batch', '1'), FILTER_VALIDATE_BOOLEAN);

        $batchItems = collect();
        $batchSummary = null;

        $hasBatchIdColumn = Schema::hasColumn('samples', 'request_batch_id');
        $hasBatchTotalColumn = Schema::hasColumn('samples', 'request_batch_total');

        $requestBatchId = $hasBatchIdColumn
            ? trim((string) ($sample->request_batch_id ?? ''))
            : '';

        $requestBatchTotal = $hasBatchTotalColumn
            ? (int) ($sample->request_batch_total ?? 0)
            : 0;

        if ($includeBatch && ($requestBatchId !== '' || $requestBatchTotal > 1)) {
            if ($requestBatchId !== '') {
                $batchItems = Sample::query()
                    ->with(['client', 'requestedParameters', 'intakeChecklist.checker'])
                    ->where('client_id', $sample->client_id)
                    ->where('request_batch_id', $requestBatchId)
                    ->orderBy('request_batch_item_no')
                    ->orderBy('sample_id')
                    ->get();
            } else {
                $batchItems = collect([$sample]);
            }

            $activeItems = Schema::hasColumn('samples', 'batch_excluded_at')
                ? $batchItems->filter(fn(Sample $row) => empty($row->batch_excluded_at))
                : $batchItems;

            $batchSummary = [
                'request_batch_id' => $requestBatchId !== '' ? $requestBatchId : null,
                'batch_total' => $requestBatchTotal > 0 ? $requestBatchTotal : max(1, $batchItems->count()),
                'batch_active_total' => $requestBatchId !== '' ? $activeItems->count() : ($requestBatchTotal > 0 ? $requestBatchTotal : max(1, $activeItems->count())),
                'batch_excluded_total' => $requestBatchId !== '' ? max(0, $batchItems->count() - $activeItems->count()) : 0,
                'sample_ids' => $batchItems->pluck('sample_id')->map(fn($id) => (int) $id)->values()->all(),
            ];
        }

        return response()->json([
            'data' => [
                ...$sample->toArray(),
                'batch_items' => $batchItems->values()->all(),
                'batch_summary' => $batchSummary,
            ],
        ]);
    }

    public function updateStatus(SampleStatusUpdateRequest $request, Sample $sample): JsonResponse
    {
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
