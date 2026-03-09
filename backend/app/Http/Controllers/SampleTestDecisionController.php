<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleTestDecisionRequest;
use App\Models\Sample;
use App\Models\SampleTest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class SampleTestDecisionController extends Controller
{
    public function omDecision(SampleTestDecisionRequest $request, SampleTest $sampleTest): JsonResponse
    {
        $this->authorize('decideAsOM', $sampleTest);

        $decision = $request->validated()['decision'];
        $note = $this->normalizeNote($request->validated()['note'] ?? null);

        if ((string) $sampleTest->status !== 'measured') {
            return $this->unprocessable(
                'OM decision not allowed for current status.',
                (string) $sampleTest->status
            );
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
            [
                'status' => (string) $sampleTest->status,
                'decision' => $decision,
            ]
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

    public function lhDecision(SampleTestDecisionRequest $request, SampleTest $sampleTest): JsonResponse
    {
        $this->authorize('decideAsLH', $sampleTest);

        $decision = $request->validated()['decision'];
        $note = $this->normalizeNote($request->validated()['note'] ?? null);

        if ((string) $sampleTest->status !== 'verified') {
            return $this->unprocessable(
                'LH decision not allowed for current status.',
                (string) $sampleTest->status
            );
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
            [
                'status' => (string) $sampleTest->status,
                'decision' => $decision,
            ]
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

    public function verifyAsOM(Request $request, int $id): JsonResponse
    {
        $test = SampleTest::query()->findOrFail($id);

        $this->authorize('verifyAsOM', $test);

        $note = $this->normalizeNote($request->input('note'));
        $oldStatus = (string) $test->getAttribute('status');

        if ($oldStatus !== 'measured') {
            return $this->unprocessable(
                'Invalid transition. Only measured tests can be verified.',
                $oldStatus
            );
        }

        $test->forceFill([
            'status' => 'verified',
            'om_verified' => true,
            'om_verified_at' => now(),
        ])->save();

        $this->auditDecision(
            $test,
            'SAMPLE_TEST_OM_VERIFIED',
            $note,
            ['status' => $oldStatus],
            ['status' => 'verified']
        );

        return response()->json([
            'status' => 200,
            'message' => 'Sample test verified by OM.',
            'data' => $this->buildTestResponseData($test),
        ], 200);
    }

    public function validateAsLH(Request $request, int $id): JsonResponse
    {
        $test = SampleTest::query()->findOrFail($id);

        $this->authorize('validateAsLH', $test);

        $note = $this->normalizeNote($request->input('note'));
        $oldStatus = (string) $test->getAttribute('status');

        if ($oldStatus !== 'verified') {
            return $this->unprocessable(
                'Invalid transition. Only verified tests can be validated.',
                $oldStatus
            );
        }

        $test->forceFill([
            'status' => 'validated',
            'lh_validated' => true,
            'lh_validated_at' => now(),
        ])->save();

        $this->auditDecision(
            $test,
            'SAMPLE_TEST_LH_VALIDATED',
            $note,
            ['status' => $oldStatus],
            ['status' => 'validated']
        );

        return response()->json([
            'status' => 200,
            'message' => 'Sample test validated by LH.',
            'data' => $this->buildTestResponseData($test),
        ], 200);
    }

    private function buildTestResponseData(SampleTest $test): array
    {
        $fresh = $test->fresh() ?? $test;
        $sample = Sample::query()
            ->select(['sample_id', 'request_batch_id', 'request_batch_item_no', 'request_batch_total'])
            ->find((int) $test->getAttribute('sample_id'));

        return [
            ...$fresh->toArray(),
            'request_batch_id' => $sample?->request_batch_id,
            'request_batch_item_no' => $sample?->request_batch_item_no,
            'request_batch_total' => $sample?->request_batch_total,
        ];
    }

    private function normalizeNote(mixed $note): ?string
    {
        return is_string($note) ? $note : null;
    }

    private function unprocessable(string $message, string $currentStatus): JsonResponse
    {
        return response()->json([
            'status' => 422,
            'message' => $message,
            'data' => ['current_status' => $currentStatus],
        ], 422);
    }

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
            $staffId = $user?->staff_id ?? ($user?->staff?->staff_id ?? null);

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
