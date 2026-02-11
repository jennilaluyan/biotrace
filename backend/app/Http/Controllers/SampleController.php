<?php

namespace App\Http\Controllers;

use App\Enums\SampleHighLevelStatus;
use App\Http\Requests\SampleStatusUpdateRequest;
use App\Http\Requests\SampleStoreRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Models\Parameter;
use App\Support\AuditLogger;
use App\Support\SampleStatusTransitions;
use App\Services\WorkflowGroupResolver;
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

        // Filter out requests: lab samples must have lab_sample_code
        if (Schema::hasColumn('samples', 'lab_sample_code')) {
            $query->whereNotNull('samples.lab_sample_code');
        }

        /**
         * ✅ Enrich samples list dengan info LOO + latest reagent request (per LOO)
         * - lo_id, lo_number, lo_generated_at
         * - reagent_request_id, reagent_request_status
         *
         * Semua join dibuat "best-effort" (kalau tabel tidak ada, skip).
         */
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
            // sample_id -> latest lo_id
            $loMap = DB::table('letter_of_order_items')
                ->selectRaw('sample_id, MAX(lo_id) as lo_id')
                ->groupBy('sample_id');

            $query->leftJoinSub($loMap, 'lo_map', function ($join) {
                $join->on('lo_map.sample_id', '=', 'samples.sample_id');
            });

            // join letters_of_order untuk ambil number/generated_at
            if ($hasLoTable) {
                $query->leftJoin('letters_of_order as lo', 'lo.lo_id', '=', 'lo_map.lo_id');
            }

            // latest reagent_request per lo_id
            if ($hasReagentRequests) {
                $rrMap = DB::table('reagent_requests')
                    ->selectRaw('lo_id, MAX(reagent_request_id) as reagent_request_id')
                    ->groupBy('lo_id');

                $query->leftJoinSub($rrMap, 'rr_map', function ($join) {
                    $join->on('rr_map.lo_id', '=', 'lo_map.lo_id');
                });

                $query->leftJoin('reagent_requests as rr', 'rr.reagent_request_id', '=', 'rr_map.reagent_request_id');
            }

            // Select extra columns (safe)
            $query->addSelect([
                DB::raw('lo_map.lo_id as lo_id'),
                DB::raw($hasLoTable ? 'lo.number as lo_number' : 'NULL as lo_number'),
                DB::raw($hasLoTable ? 'lo.generated_at as lo_generated_at' : 'NULL as lo_generated_at'),
                DB::raw($hasReagentRequests ? 'rr.reagent_request_id as reagent_request_id' : 'NULL as reagent_request_id'),
                DB::raw($hasReagentRequests ? 'rr.status as reagent_request_status' : 'NULL as reagent_request_status'),
            ]);
        }

        /**
         * Samples page should show:
         * - legacy/manual lab workflow: request_status NULL + current_status not null
         * - request workflow samples: only after included in LOO (exists in letter_of_order_items)
         */
        $hasLooItemsExists = Schema::hasTable('letter_of_order_items') && Schema::hasColumn('letter_of_order_items', 'sample_id');
        $hasCurrentStatus  = Schema::hasColumn('samples', 'current_status');
        $hasRequestStatus  = Schema::hasColumn('samples', 'request_status');

        $query->where(function ($w) use ($hasCurrentStatus, $hasLooItemsExists, $hasRequestStatus) {
            $any = false;

            if ($hasCurrentStatus) {
                if ($hasRequestStatus) {
                    // legacy/manual = request_status NULL
                    $w->where(function ($qq) {
                        $qq->whereNull('request_status')
                            ->whereNotNull('current_status');
                    });
                } else {
                    $w->whereNotNull('current_status');
                }
                $any = true;
            }

            // request workflow sample only show after in LOO
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

        if ($request->filled('status_enum')) {
            $raw = strtolower((string) $request->get('status_enum'));
            $enum = SampleHighLevelStatus::tryFrom($raw);
            if ($enum) {
                $query->whereIn('current_status', $enum->currentStatuses());
            }
        }

        /**
         * ✅ Default: hide completed samples (current_status = reported) from Sample Management
         * Reason: reported = COA sudah keluar, harus pindah ke Archive page.
         *
         * Override (optional): /v1/samples?include_reported=1
         * NOTE: kalau user pakai status_enum, jangan override filter ini (biar filter status tetap bekerja).
         */
        $includeReported = filter_var((string) $request->query('include_reported', '0'), FILTER_VALIDATE_BOOLEAN);

        if ($hasCurrentStatus && !$includeReported && !$request->filled('status_enum')) {
            $query->where(function ($w) {
                $w->whereNull('samples.current_status')
                    ->orWhere('samples.current_status', '!=', 'reported');
            });
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

        // pivot sync
        $sample->requestedParameters()->sync($parameterIds);

        // ✅ Step 9.1 source-of-truth resolver (ranges + exclude param 18)
        $oldGroup = $sample->workflow_group;

        $resolved = (new WorkflowGroupResolver())->resolveFromParameterIds($parameterIds);
        $newGroup = $resolved?->value;

        // Only write & audit when changed (anti-spam)
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
