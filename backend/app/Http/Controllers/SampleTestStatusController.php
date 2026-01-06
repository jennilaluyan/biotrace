<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\SampleTest;
use App\Models\Staff;
use App\Services\QcEvaluationService;
use App\Services\ReagentCalcService;
use App\Support\SampleTestStatusTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class SampleTestStatusController extends Controller
{
    public function update(Request $request, SampleTest $sampleTest): JsonResponse
    {
        // RBAC (Analyst only)
        $this->authorize('updateStatusAsAnalyst', $sampleTest);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:in_progress,measured,failed'],
        ]);

        $from = (string) $sampleTest->status;
        $to   = (string) $data['status'];

        // keep original status (untuk audit + recompute)
        $oldStatus = $from;

        if (!SampleTestStatusTransitions::isAllowedForAnalyst($from, $to)) {
            throw ValidationException::withMessages([
                'status' => ["Invalid status transition: {$from} -> {$to}"],
            ]);
        }

        /**
         * ✅ QC GUARD (per-sample, sama dengan /samples/{sample}/qc-summary)
         * Test butuh: QC fail -> draft->in_progress harus diblok.
         */
        if (in_array($to, ['in_progress', 'measured'], true)) {
            $qcService = app(QcEvaluationService::class);

            $sampleId = (int) $sampleTest->sample_id;
            $batchId  = (int) ($sampleTest->batch_id ?? $sampleId);

            // prefer summarizeSample kalau ada, biar konsisten dengan endpoint qc-summary
            if (method_exists($qcService, 'summarizeSample')) {
                $summary = $qcService->summarizeSample($sampleId);
            } else {
                $summary = $qcService->summarizeBatch($batchId);
            }

            $qcStatus = strtolower((string) ($summary['status'] ?? 'pass'));

            if ($qcStatus === 'fail') {
                return response()->json([
                    'status' => 422,
                    'message' => 'QC failed: cannot progress sample test status until QC is resolved.',
                    'data' => [
                        'sample_id' => $sampleId,
                        'batch_id' => $batchId,
                        'qc_status' => $qcStatus,
                        'qc_counts' => $summary['counts'] ?? null,
                    ],
                ], 422);
            }
        }

        // Timestamp automation
        if ($to === 'in_progress' && $sampleTest->started_at === null) {
            $sampleTest->started_at = now();
        }

        if (in_array($to, ['measured', 'failed'], true) && $sampleTest->completed_at === null) {
            $sampleTest->completed_at = now();
        }

        // Apply status
        $sampleTest->status = $to;
        $sampleTest->save();

        /**
         * Optional: trigger reagent recompute (kalau ada flow rerun/cancelled)
         */
        try {
            $newStatus = (string) $sampleTest->status;

            $user = Auth::user();
            $actorStaffId = (int) ($user?->staff_id ?? 0);

            if ($actorStaffId <= 0 && $user) {
                $actorStaffId = (int) Staff::query()
                    ->where('user_id', $user->id)
                    ->value('staff_id');
            }

            if ($actorStaffId > 0) {
                $trigger = null;

                // cancellation
                if ($newStatus === 'cancelled') {
                    $trigger = 'cancelled';
                }

                // rerun: balik ke in_progress dari status lebih lanjut
                $forwardStates = ['measured', 'verified', 'validated'];
                if ($newStatus === 'in_progress' && in_array($oldStatus, $forwardStates, true)) {
                    $trigger = 'rerun';
                }

                if ($trigger) {
                    app(ReagentCalcService::class)->recomputeForSample(
                        (int) $sampleTest->sample_id,
                        $trigger,
                        $actorStaffId,
                        [
                            'sample_test_id' => (int) $sampleTest->sample_test_id,
                            'from' => $oldStatus,
                            'to' => $newStatus,
                        ]
                    );
                }
            }
        } catch (\Throwable $e) {
            logger()->warning('Reagent recompute skipped on sample_test status change', [
                'sample_test_id' => $sampleTest->sample_test_id ?? null,
                'error' => $e->getMessage(),
            ]);
        }

        // audit payload
        $old = [
            'status'       => $oldStatus,
            'started_at'   => optional($sampleTest->getOriginal('started_at'))->toIso8601String(),
            'completed_at' => optional($sampleTest->getOriginal('completed_at'))->toIso8601String(),
            'assigned_to'  => $sampleTest->getOriginal('assigned_to'),
        ];

        $new = [
            'status'       => $sampleTest->status,
            'started_at'   => optional($sampleTest->started_at)->toIso8601String(),
            'completed_at' => optional($sampleTest->completed_at)->toIso8601String(),
            'assigned_to'  => $sampleTest->assigned_to,
        ];

        try {
            AuditLog::create([
                'staff_id'    => $request->user()?->staff_id,
                'entity_name' => 'sample_test',
                'entity_id'   => (int) $sampleTest->sample_test_id,
                'action'      => 'SAMPLE_TEST_STATUS_CHANGED',
                'timestamp'   => now(),
                'ip_address'  => $request->ip(),
                'old_values'  => $old,
                'new_values'  => $new,
            ]);
        } catch (\Throwable $e) {
            Log::warning('AuditLog write failed (sample_test status): ' . $e->getMessage());
        }

        return response()->json([
            'status' => 200,
            'message' => 'Sample test status updated.',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'from' => $from,
                'to' => $sampleTest->status,
                'started_at' => $sampleTest->started_at,
                'completed_at' => $sampleTest->completed_at,
            ],
        ]);
    }
}
