<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleTestsBulkStoreRequest;
use App\Models\LetterOfOrder;
use App\Models\Method;
use App\Models\Parameter;
use App\Models\Sample;
use App\Models\SampleTest;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleTestBulkController extends Controller
{
    public function store(SampleTestsBulkStoreRequest $request, Sample $sample): JsonResponse
    {
        $this->authorize('bulkCreate', [SampleTest::class, $sample]);

        $validated = $request->validated();
        $items = $validated['tests'];
        $sampleIds = $this->resolveTargetSampleIds($validated, $sample);

        $parameterIds = collect($items)
            ->pluck('parameter_id')
            ->filter()
            ->map(fn($id) => (int) $id)
            ->unique()
            ->values();

        $methodIds = collect($items)
            ->pluck('method_id')
            ->filter()
            ->map(fn($id) => (int) $id)
            ->unique()
            ->values();

        $assigneeIds = collect($items)
            ->pluck('assigned_to')
            ->filter()
            ->map(fn($id) => (int) $id)
            ->unique()
            ->values();

        $missingParameters = $parameterIds->diff(
            Parameter::query()->whereIn('parameter_id', $parameterIds)->pluck('parameter_id')
        )->values();

        if ($missingParameters->isNotEmpty()) {
            return response()->json([
                'status' => 422,
                'message' => 'Some parameter_id not found.',
                'missing' => [
                    'parameter_id' => $missingParameters,
                ],
            ], 422);
        }

        if ($methodIds->isNotEmpty()) {
            $missingMethods = $methodIds->diff(
                Method::query()->whereIn('method_id', $methodIds)->pluck('method_id')
            )->values();

            if ($missingMethods->isNotEmpty()) {
                return response()->json([
                    'status' => 422,
                    'message' => 'Some method_id not found.',
                    'missing' => [
                        'method_id' => $missingMethods,
                    ],
                ], 422);
            }
        }

        if ($assigneeIds->isNotEmpty()) {
            $missingAssignees = $assigneeIds->diff(
                Staff::query()->whereIn('staff_id', $assigneeIds)->pluck('staff_id')
            )->values();

            if ($missingAssignees->isNotEmpty()) {
                return response()->json([
                    'status' => 422,
                    'message' => 'Some assigned_to staff_id not found.',
                    'missing' => [
                        'assigned_to' => $missingAssignees,
                    ],
                ], 422);
            }
        }

        $result = DB::transaction(function () use ($sampleIds, $parameterIds, $items) {
            $targets = Sample::query()
                ->whereIn('sample_id', $sampleIds)
                ->lockForUpdate()
                ->get();

            if ($targets->count() !== count($sampleIds)) {
                return response()->json([
                    'status' => 422,
                    'message' => 'Some sample_ids are invalid.',
                ], 422);
            }

            $clientIds = $targets
                ->pluck('client_id')
                ->map(fn($value) => (int) $value)
                ->unique()
                ->values()
                ->all();

            if (count($clientIds) > 1) {
                return response()->json([
                    'status' => 422,
                    'message' => 'All selected samples must belong to the same client.',
                ], 422);
            }

            $batchIds = $targets
                ->pluck('request_batch_id')
                ->map(fn($value) => trim((string) $value))
                ->filter()
                ->unique()
                ->values()
                ->all();

            if (count($batchIds) > 1) {
                return response()->json([
                    'status' => 422,
                    'message' => 'All selected samples must belong to the same institutional batch.',
                ], 422);
            }

            foreach ($targets as $targetSample) {
                $block = $this->checkLoaLockedGate($targetSample);
                if ($block !== null) {
                    return $block;
                }
            }

            $now = now();
            $toInsert = [];
            $skipped = [];

            foreach ($targets as $targetSample) {
                $already = SampleTest::query()
                    ->where('sample_id', (int) $targetSample->sample_id)
                    ->whereIn('parameter_id', $parameterIds)
                    ->pluck('parameter_id')
                    ->flip();

                foreach ($items as $item) {
                    $parameterId = (int) $item['parameter_id'];

                    if (isset($already[$parameterId])) {
                        $skipped[] = [
                            'sample_id' => (int) $targetSample->sample_id,
                            'parameter_id' => $parameterId,
                        ];
                        continue;
                    }

                    $toInsert[] = [
                        'sample_id' => (int) $targetSample->sample_id,
                        'parameter_id' => $parameterId,
                        'method_id' => $item['method_id'] ?? null,
                        'assigned_to' => $item['assigned_to'] ?? null,
                        'status' => 'draft',
                        'qc_done' => false,
                        'om_verified' => false,
                        'lh_validated' => false,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];

                    $already[$parameterId] = true;
                }
            }

            foreach (array_chunk($toInsert, 100) as $chunk) {
                SampleTest::query()->insert($chunk);
            }

            return [
                'targets' => $targets,
                'to_insert' => $toInsert,
                'skipped' => $skipped,
            ];
        });

        if ($result instanceof JsonResponse) {
            return $result;
        }

        $targets = $result['targets'];
        $toInsert = $result['to_insert'];
        $skipped = $result['skipped'];

        $this->tryAuditBulkCreatedForTargets($targets, $toInsert, $skipped);
        $this->tryUpsertReagentBaselineForTargets($targets);

        return response()->json([
            'status' => 200,
            'message' => 'Sample tests bulk created.',
            'data' => [
                'affected_sample_ids' => $targets
                    ->pluck('sample_id')
                    ->map(fn($id) => (int) $id)
                    ->values()
                    ->all(),
                'created_count' => count($toInsert),
                'skipped' => $skipped,
            ],
        ], 200);
    }

    private function resolveTargetSampleIds(array $validated, Sample $sample): array
    {
        $sampleIds = array_values(array_unique(array_map(
            'intval',
            (array) ($validated['sample_ids'] ?? [])
        )));

        if (count($sampleIds) <= 0) {
            $sampleIds = [(int) $sample->getAttribute('sample_id')];
        }

        return $sampleIds;
    }

    private function checkLoaLockedGate(Sample $sample): ?JsonResponse
    {
        try {
            if (!Schema::hasTable('letters_of_order')) {
                return null;
            }

            $batchId = trim((string) $sample->getAttribute('request_batch_id'));
            $sampleId = (int) $sample->getAttribute('sample_id');

            $loaQuery = LetterOfOrder::query();

            if ($batchId !== '' && Schema::hasColumn('letters_of_order', 'request_batch_id')) {
                $loaQuery->where('request_batch_id', $batchId);
            } else {
                $loaQuery->where('sample_id', $sampleId);
            }

            $loa = $loaQuery
                ->orderByDesc('lo_id')
                ->first();

            if (!$loa) {
                return response()->json([
                    'status' => 422,
                    'message' => 'Letter of Order is required before assigning sample tests.',
                    'errors' => [
                        'loa' => ['missing'],
                    ],
                ], 422);
            }

            if (($loa->loa_status ?? null) !== 'locked') {
                return response()->json([
                    'status' => 422,
                    'message' => 'Letter of Order must be locked before assigning sample tests.',
                    'errors' => [
                        'loa_status' => [$loa->loa_status],
                    ],
                ], 422);
            }

            return null;
        } catch (\Throwable $e) {
            logger()->warning('LoA lock gate check failed (fail-open)', [
                'sample_id' => (int) $sample->getAttribute('sample_id'),
                'request_batch_id' => $sample->getAttribute('request_batch_id'),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function tryAuditBulkCreatedForTargets($targets, array $createdRows, array $skipped): void
    {
        try {
            if (!Schema::hasTable('audit_logs')) {
                return;
            }

            $user = Auth::user();
            $staffId = $user?->staff_id;

            if (!$staffId) {
                return;
            }

            $createdBySample = [];
            foreach ($createdRows as $row) {
                $sampleId = (int) $row['sample_id'];
                $createdBySample[$sampleId][] = [
                    'parameter_id' => $row['parameter_id'],
                    'method_id' => $row['method_id'] ?? null,
                    'assigned_to' => $row['assigned_to'] ?? null,
                ];
            }

            $skippedBySample = [];
            foreach ($skipped as $row) {
                $sampleId = (int) $row['sample_id'];
                $skippedBySample[$sampleId][] = (int) $row['parameter_id'];
            }

            $now = now();
            $ipAddress = request()->ip();
            $auditRows = [];

            foreach ($targets as $targetSample) {
                $sampleId = (int) $targetSample->sample_id;

                $auditRows[] = [
                    'staff_id' => $staffId,
                    'entity_name' => 'sample',
                    'entity_id' => $sampleId,
                    'action' => 'SAMPLE_TESTS_BULK_CREATED',
                    'timestamp' => $now,
                    'ip_address' => $ipAddress,
                    'old_values' => null,
                    'new_values' => json_encode([
                        'created' => $createdBySample[$sampleId] ?? [],
                        'skipped_parameter_ids' => array_values(array_unique($skippedBySample[$sampleId] ?? [])),
                    ]),
                ];
            }

            if (!empty($auditRows)) {
                DB::table('audit_logs')->insert($auditRows);
            }
        } catch (\Throwable $e) {
            logger()->warning('Audit log insert failed (bulk sample tests)', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function tryUpsertReagentBaselineForTargets($targets): void
    {
        try {
            $actorStaffId = $this->resolveActorStaffId();

            if ($actorStaffId <= 0) {
                throw new \RuntimeException('Missing actor staff_id for reagent baseline calc (computed_by NOT NULL).');
            }

            $service = app(\App\Services\ReagentCalcService::class);

            foreach ($targets as $targetSample) {
                $service->upsertBaselineForSample((int) $targetSample->sample_id, $actorStaffId);
            }
        } catch (\Throwable $e) {
            logger()->warning('Reagent baseline calc failed after bulk sample_tests', [
                'sample_ids' => collect($targets)->pluck('sample_id')->map(fn($id) => (int) $id)->values()->all(),
                'error' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
        }
    }

    private function resolveActorStaffId(): int
    {
        $user = Auth::user();

        if ($user && isset($user->staff_id) && is_numeric($user->staff_id)) {
            return (int) $user->staff_id;
        }

        if ($user && method_exists($user, 'staff') && $user->staff && isset($user->staff->staff_id)) {
            return (int) $user->staff->staff_id;
        }

        if ($user && isset($user->id)) {
            return (int) Staff::query()
                ->where('user_id', $user->id)
                ->value('staff_id');
        }

        return 0;
    }
}
