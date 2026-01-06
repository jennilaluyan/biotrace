<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleTestDecisionRequest;
use App\Models\SampleTest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class SampleTestDecisionController extends Controller
{
    /**
     * Existing endpoint (legacy): OM decision approve/reject
     * - approve: measured -> verified
     * - reject:  measured -> failed
     */
    public function omDecision(SampleTestDecisionRequest $request, SampleTest $sampleTest): JsonResponse
    {
        $this->authorize('decideAsOM', $sampleTest);

        $decision = $request->validated()['decision'];
        $note     = $request->validated()['note'] ?? null;

        // only allowed on measured
        if (!in_array($sampleTest->status, ['measured'], true)) {
            return response()->json([
                'status' => 422,
                'message' => 'OM decision not allowed for current status.',
                'data' => ['current_status' => $sampleTest->status],
            ], 422);
        }

        $oldStatus = (string) $sampleTest->status;

        if ($decision === 'approve') {
            $sampleTest->forceFill([
                'om_verified' => true,
                'om_verified_at' => now(),
                'status' => 'verified',
            ])->save();

            $action = 'SAMPLE_TEST_OM_VERIFIED';
        } else {
            // reject
            $sampleTest->forceFill([
                'status' => 'failed',
            ])->save();

            $action = 'SAMPLE_TEST_OM_REJECTED';
        }

        $this->auditDecision(
            $sampleTest,
            $action,
            $note,
            ['status' => $oldStatus],
            ['status' => (string) $sampleTest->status, 'decision' => $decision]
        );

        return response()->json([
            'status' => 200,
            'message' => 'OM decision recorded.',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'from' => $oldStatus,
                'to' => $sampleTest->status,
                'om_verified' => (bool) $sampleTest->om_verified,
                'om_verified_at' => $sampleTest->om_verified_at,
            ],
        ], 200);
    }

    /**
     * Existing endpoint (legacy): LH decision approve/reject
     * - approve: verified -> validated
     * - reject:  verified -> failed
     */
    public function lhDecision(SampleTestDecisionRequest $request, SampleTest $sampleTest): JsonResponse
    {
        $this->authorize('decideAsLH', $sampleTest);

        $decision = $request->validated()['decision'];
        $note     = $request->validated()['note'] ?? null;

        // only allowed on verified
        if (!in_array($sampleTest->status, ['verified'], true)) {
            return response()->json([
                'status' => 422,
                'message' => 'LH decision not allowed for current status.',
                'data' => ['current_status' => $sampleTest->status],
            ], 422);
        }

        $oldStatus = (string) $sampleTest->status;

        if ($decision === 'approve') {
            $sampleTest->forceFill([
                'lh_validated' => true,
                'lh_validated_at' => now(),
                'status' => 'validated',
            ])->save();

            $action = 'SAMPLE_TEST_LH_VALIDATED';
        } else {
            $sampleTest->forceFill([
                'status' => 'failed',
            ])->save();

            $action = 'SAMPLE_TEST_LH_REJECTED';
        }

        $this->auditDecision(
            $sampleTest,
            $action,
            $note,
            ['status' => $oldStatus],
            ['status' => (string) $sampleTest->status, 'decision' => $decision]
        );

        return response()->json([
            'status' => 200,
            'message' => 'LH decision recorded.',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'from' => $oldStatus,
                'to' => $sampleTest->status,
                'lh_validated' => (bool) $sampleTest->lh_validated,
                'lh_validated_at' => $sampleTest->lh_validated_at,
            ],
        ], 200);
    }

    /**
     * New endpoint (To Do): OM verify
     * POST /api/v1/sample-tests/{id}/verify
     */
    public function verifyAsOM(Request $request, int $id): JsonResponse
    {
        $test = SampleTest::query()->findOrFail($id);

        $this->authorize('verifyAsOM', $test);

        $note = $request->input('note');
        $oldStatus = (string) $test->getAttribute('status');

        if ($oldStatus !== 'measured') {
            return response()->json([
                'status' => 422,
                'message' => 'Invalid transition. Only measured tests can be verified.',
                'data' => ['current_status' => $oldStatus],
            ], 422);
        }

        $test->forceFill([
            'status' => 'verified',
            'om_verified' => true,
            'om_verified_at' => now(),
        ])->save();

        $this->auditDecision(
            $test,
            'SAMPLE_TEST_OM_VERIFIED',
            is_string($note) ? $note : null,
            ['status' => $oldStatus],
            ['status' => 'verified']
        );

        return response()->json([
            'status' => 200,
            'message' => 'Sample test verified by OM.',
            'data' => $test->fresh(),
        ], 200);
    }

    /**
     * New endpoint (To Do): LH validate
     * POST /api/v1/sample-tests/{id}/validate
     */
    public function validateAsLH(Request $request, int $id): JsonResponse
    {
        $test = SampleTest::query()->findOrFail($id);

        $this->authorize('validateAsLH', $test);

        $note = $request->input('note');
        $oldStatus = (string) $test->getAttribute('status');

        if ($oldStatus !== 'verified') {
            return response()->json([
                'status' => 422,
                'message' => 'Invalid transition. Only verified tests can be validated.',
                'data' => ['current_status' => $oldStatus],
            ], 422);
        }

        $test->forceFill([
            'status' => 'validated',
            'lh_validated' => true,
            'lh_validated_at' => now(),
        ])->save();

        $this->auditDecision(
            $test,
            'SAMPLE_TEST_LH_VALIDATED',
            is_string($note) ? $note : null,
            ['status' => $oldStatus],
            ['status' => 'validated']
        );

        return response()->json([
            'status' => 200,
            'message' => 'Sample test validated by LH.',
            'data' => $test->fresh(),
        ], 200);
    }

    /**
     * Internal audit helper (safe):
     * - action truncated to 40 chars (audit_logs.action is varchar(40))
     * - staff_id resolved robustly
     */
    private function auditDecision(
        SampleTest $test,
        string $action,
        ?string $note,
        array $old,
        array $new
    ): void {
        try {
            $action = Str::limit($action, 40, '');

            $user = Auth::user();
            $staffId =
                $user?->staff_id
                ?? ($user?->staff?->staff_id ?? null);

            // staff_id wajib untuk audit_logs (kalau null, skip biar endpoint tetap jalan)
            if (!$staffId || !is_numeric($staffId)) {
                return;
            }

            app(\App\Support\AuditLogger::class)->write(
                staffId: (int) $staffId,
                entityName: 'sample_test',
                entityId: (int) $test->getAttribute('sample_test_id'),
                action: $action,
                oldValues: $old,
                newValues: array_merge($new, ['note' => $note]),
            );
        } catch (\Throwable $e) {
            logger()->warning('auditDecision failed', [
                'error' => $e->getMessage(),
                'action' => $action,
                'sample_test_id' => $test->getAttribute('sample_test_id'),
            ]);
        }
    }
}
