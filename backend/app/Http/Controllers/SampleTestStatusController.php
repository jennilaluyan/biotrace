<?php

namespace App\Http\Controllers;

use App\Models\SampleTest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\SampleTestStatusTransitions;
use Illuminate\Validation\ValidationException;
use App\Models\AuditLog;
use Illuminate\Support\Facades\Log;
use App\Models\Staff;
use App\Services\ReagentCalcService;
use Illuminate\Support\Facades\Auth;
use App\Services\QcEvaluationService;

class SampleTestStatusController extends Controller
{
    public function update(Request $request, SampleTest $sampleTest): JsonResponse
    {
        // RBAC (Analyst only) - sesuaikan nama ability/policy kamu
        $this->authorize('updateStatusAsAnalyst', $sampleTest);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:in_progress,measured,failed'],
        ]);

        $from = $sampleTest->status;

        $to = $data['status'];

        if (!SampleTestStatusTransitions::isAllowedForAnalyst($from, $to)) {
            throw ValidationException::withMessages([
                'status' => ["Invalid status transition: {$from} -> {$to}"],
            ]);
        }

        if ($to === 'in_progress' && $sampleTest->started_at === null) {
            $sampleTest->started_at = now();
        }

        if (in_array($to, ['measured', 'failed'], true) && $sampleTest->completed_at === null) {
            $sampleTest->completed_at = now();
        }

        // Guard transisi (Step 8)
        $allowed = [
            'draft' => ['in_progress'],
            'in_progress' => ['measured', 'failed'],
        ];

        if ($to === 'measured') {
            $batchId = (int) ($sampleTest->batch_id ?? $sampleTest->sample_id);

            $summary = app(QcEvaluationService::class)->summarizeBatch($batchId);

            if (($summary['status'] ?? 'pass') === 'fail') {
                return response()->json([
                    'status' => 422,
                    'message' => 'QC failed: cannot mark sample test as measured until QC is resolved.',
                    'data' => [
                        'batch_id' => $batchId,
                        'qc_status' => $summary['status'] ?? 'fail',
                        'qc_counts' => $summary['counts'] ?? null,
                    ],
                ], 422);
            }
        }

        if (!isset($allowed[$from]) || !in_array($data['status'], $allowed[$from], true)) {
            return response()->json([
                'status' => 422,
                'message' => 'Invalid status transition for Analyst.',
                'data' => [
                    'from' => $from,
                    'to' => $data['status'],
                ],
            ], 422);
        }

        // Timestamp automation
        if ($from === 'draft' && $data['status'] === 'in_progress' && !$sampleTest->started_at) {
            $sampleTest->started_at = now();
        }

        if ($data['status'] === 'measured' && !$sampleTest->completed_at) {
            $sampleTest->completed_at = now();
        }

        $sampleTest->status = $to;
        $sampleTest->save();

        try {
            $oldStatus = (string) ($oldStatus ?? ''); // kalau kamu sudah simpan sebelumnya
            $newStatus = (string) $sampleTest->status;

            // resolve actorStaffId (computed_by NOT NULL)
            $user = Auth::user();
            $actorStaffId = (int) ($user?->staff_id ?? 0);

            if ($actorStaffId <= 0 && $user) {
                $actorStaffId = (int) Staff::query()->where('user_id', $user->id)->value('staff_id');
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

        $oldStatus = (string) $sampleTest->status;

        $old = [
            'status'       => $from,
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
