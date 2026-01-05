<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleTestsBulkStoreRequest;
use App\Models\Method;
use App\Models\Parameter;
use App\Models\Sample;
use App\Models\SampleTest;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Services\ReagentCalcService;

class SampleTestBulkController extends Controller
{
    public function store(SampleTestsBulkStoreRequest $request, Sample $sample): JsonResponse
    {
        // 1) RBAC / Policy check
        $this->authorize('bulkCreate', [SampleTest::class, $sample]);

        $items = $request->validated()['tests'];

        // 2) Normalisasi + unikkan parameter_id dalam request (biar gak dobel di 1 request)
        $parameterIds = collect($items)->pluck('parameter_id')->filter()->unique()->values();
        $methodIds    = collect($items)->pluck('method_id')->filter()->unique()->values();
        $assigneeIds  = collect($items)->pluck('assigned_to')->filter()->unique()->values();

        // 3) Validasi existence via WHERE IN sekali (memory-safe)
        $existingParameters = Parameter::query()
            ->whereIn('parameter_id', $parameterIds)
            ->pluck('parameter_id');

        $missingParameters = $parameterIds->diff($existingParameters)->values();
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
            $existingMethods = Method::query()
                ->whereIn('method_id', $methodIds)
                ->pluck('method_id');

            $missingMethods = $methodIds->diff($existingMethods)->values();
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
            $existingAssignees = Staff::query()
                ->whereIn('staff_id', $assigneeIds)
                ->pluck('staff_id');

            $missingAssignees = $assigneeIds->diff($existingAssignees)->values();
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

        // 4) Ambil yang sudah ada untuk sample ini (kunci idempotent)
        $already = SampleTest::query()
            ->where('sample_id', $sample->getAttribute('sample_id'))
            ->whereIn('parameter_id', $parameterIds)
            ->pluck('parameter_id')
            ->flip();

        $now = now();

        $toInsert = [];
        $skippedParameterIds = [];

        foreach ($items as $it) {
            $pid = (int) $it['parameter_id'];

            if (isset($already[$pid])) {
                $skippedParameterIds[] = $pid;
                continue;
            }

            $toInsert[] = [
                'sample_id'     => $sample->getAttribute('sample_id'),
                'batch_id'      => $sample->getAttribute('sample_id'),
                'parameter_id'  => $pid,
                'method_id'     => $it['method_id'] ?? null,
                'assigned_to'   => $it['assigned_to'] ?? null,
                'status'        => 'draft',
                'qc_done'       => false,
                'om_verified'   => false,
                'lh_validated'  => false,
                'created_at'    => $now,
                'updated_at'    => $now,
            ];

            // mark as already to prevent duplicates within same request
            $already[$pid] = true;
        }

        // 5) Insert batch kecil (chunk) biar gak berat
        DB::transaction(function () use (&$toInsert) {
            foreach (array_chunk($toInsert, 100) as $chunk) {
                SampleTest::query()->insert($chunk);
            }
        });

        // 6) Audit log (aman: hanya insert kalau table & kolom tersedia)
        $this->tryAuditBulkCreated($sample->getAttribute('sample_id'), $toInsert, $skippedParameterIds);

        // 7) ✅ Reagent calc baseline (post bulk create)
        try {
            $user = Auth::user();
            $actorStaffId = 0;

            if ($user && isset($user->staff_id) && is_numeric($user->staff_id)) {
                $actorStaffId = (int) $user->staff_id;
            } elseif ($user && method_exists($user, 'staff') && $user->staff && isset($user->staff->staff_id)) {
                $actorStaffId = (int) $user->staff->staff_id;
            } elseif ($user) {
                // fallback: staff.user_id -> staff_id
                $actorStaffId = (int) Staff::query()->where('user_id', $user->id)->value('staff_id');
            }

            if ($actorStaffId <= 0) {
                throw new \RuntimeException('Missing actor staff_id for reagent baseline calc (computed_by NOT NULL).');
            }

            app(\App\Services\ReagentCalcService::class)
                ->upsertBaselineForSample((int) $sample->getAttribute('sample_id'), $actorStaffId);
        } catch (\Throwable $e) {
            logger()->warning('Reagent baseline calc failed after bulk sample_tests', [
                'sample_id' => $sample->getAttribute('sample_id'),
                'error' => $e->getMessage(),
                'exception' => get_class($e),
            ]);
        }

        return response()->json([
            'status' => 200,
            'message' => 'Sample tests bulk created.',
            'data' => [
                'sample_id' => $sample->getAttribute('sample_id'),
                'created_count' => count($toInsert),
                'skipped_count' => count($skippedParameterIds),
                'skipped_parameter_ids' => $skippedParameterIds,
            ],
        ], 200);
    }

    private function tryAuditBulkCreated(int $sampleId, array $createdRows, array $skippedPids): void
    {
        try {
            if (!Schema::hasTable('audit_logs')) return;

            $user = Auth::user();

            // staff_id wajib (FK ke staffs). Kalau tidak ada user, jangan audit.
            $staffId = $user?->staff_id;
            if (!$staffId) return;

            DB::table('audit_logs')->insert([
                'staff_id'    => $staffId,
                'entity_name' => 'sample',
                'entity_id'   => $sampleId,
                'action'      => 'SAMPLE_TESTS_BULK_CREATED',
                'timestamp'   => now(),                 // sesuai migration: timestampTz
                'ip_address'  => request()->ip(),       // nullable, aman

                // schema kamu pakai old_values/new_values (json)
                'old_values'  => null,
                'new_values'  => json_encode([
                    'created' => array_map(fn($r) => [
                        'parameter_id' => $r['parameter_id'],
                        'method_id'    => $r['method_id'] ?? null,
                        'assigned_to'  => $r['assigned_to'] ?? null,
                    ], $createdRows),
                    'skipped_parameter_ids' => $skippedPids,
                ]),
            ]);
        } catch (\Throwable $e) {
            // audit gagal jangan bikin endpoint bulk create gagal
            logger()->warning('Audit log insert failed (bulk sample tests)', [
                'error' => $e->getMessage(),
                'sample_id' => $sampleId,
            ]);
        }
    }
}
