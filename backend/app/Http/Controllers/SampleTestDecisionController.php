<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleTestDecisionRequest;
use App\Models\AuditLog;
use App\Models\SampleTest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use App\Services\QcEvaluationService;

class SampleTestDecisionController extends Controller
{
    public function omDecision(SampleTestDecisionRequest $request, SampleTest $sampleTest): JsonResponse
    {
        // ✅ harus match policy: decideAsOM
        $this->authorize('decideAsOM', $sampleTest);

        $decision = $request->validated()['decision'];
        $note     = $request->validated()['note'] ?? null;

        // (opsional) OM biasanya hanya setelah measured
        if (!in_array($sampleTest->status, ['measured'], true)) {
            return response()->json([
                'status' => 422,
                'message' => 'OM decision not allowed for current status.',
                'data' => ['current_status' => $sampleTest->status],
            ], 422);
        }

        $from = $sampleTest->status;

        if ($decision === 'approve') {
            $sampleTest->om_verified = true;
            $sampleTest->om_verified_at = now();
            $sampleTest->status = 'verified';
        } else {
            $sampleTest->status = 'failed';
        }

        $sampleTest->save();

        $this->auditDecision($sampleTest, 'SAMPLE_TEST_OM_DECISION', $from, $sampleTest->status, $note);

        return response()->json([
            'status' => 200,
            'message' => 'OM decision recorded.',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'from' => $from,
                'to' => $sampleTest->status,
                'om_verified' => (bool) $sampleTest->om_verified,
                'om_verified_at' => $sampleTest->om_verified_at,
            ],
        ]);
    }

    public function lhDecision(SampleTestDecisionRequest $request, SampleTest $sampleTest): JsonResponse
    {
        // ✅ harus match policy: decideAsLH
        $this->authorize('decideAsLH', $sampleTest);

        $decision = $request->validated()['decision'];
        $note     = $request->validated()['note'] ?? null;

        if (!in_array($sampleTest->status, ['verified'], true)) {
            return response()->json([
                'status' => 422,
                'message' => 'LH decision not allowed for current status.',
                'data' => ['current_status' => $sampleTest->status],
            ], 422);
        }

        $from = $sampleTest->status;

        if ($decision === 'approve') {
            $sampleTest->lh_validated = true;
            $sampleTest->lh_validated_at = now();
            $sampleTest->status = 'validated';
        } else {
            $sampleTest->status = 'failed';
        }

        $sampleTest->save();

        $this->auditDecision($sampleTest, 'SAMPLE_TEST_LH_DECISION', $from, $sampleTest->status, $note);

        return response()->json([
            'status' => 200,
            'message' => 'LH decision recorded.',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'from' => $from,
                'to' => $sampleTest->status,
                'lh_validated' => (bool) $sampleTest->lh_validated,
                'lh_validated_at' => $sampleTest->lh_validated_at,
            ],
        ]);
    }

    private function auditDecision(SampleTest $st, string $action, string $from, string $to, ?string $note): void
    {
        $user = Auth::user();
        $staffId = $user->staff_id ?? $user->getAuthIdentifier();

        // ✅ aman: insert langsung sesuai schema audit_logs kamu
        DB::table('audit_logs')->insert([
            'staff_id'    => $staffId,
            'entity_name' => 'sample_test',
            'entity_id'   => $st->sample_test_id,
            'action'      => $action,
            'timestamp'   => now(),
            'ip_address'  => request()->ip(),
            'old_values'  => json_encode(['status' => $from]),
            'new_values'  => json_encode(['status' => $to, 'note' => $note]),
        ]);
    }

    public function verifyAsOM(Request $request, SampleTest $sampleTest)
    {
        // RBAC: OM only
        $this->authorize('verifyAsOM', $sampleTest);

        $request->validate([
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $from = (string) $sampleTest->status;

        // Idempotent: kalau sudah verified/validated, jangan bikin error (biar bulk action aman)
        if (in_array($from, ['verified', 'validated'], true)) {
            return response()->json([
                'message' => 'Sample test already verified.',
                'data' => [
                    'sample_test_id' => $sampleTest->sample_test_id,
                    'status' => $sampleTest->status,
                    'om_verified' => (bool) $sampleTest->om_verified,
                    'om_verified_at' => $sampleTest->om_verified_at,
                ],
            ]);
        }

        // Transition rule: measured -> verified only
        if ($from !== 'measured') {
            throw ValidationException::withMessages([
                'status' => ["Invalid transition for verify: {$from} -> verified"],
            ])->status(422);
        }

        // QC GUARD (consistent with SampleTestStatusController comment: per-sample qc-summary)
        $qc = app(QcEvaluationService::class);
        $summary = $qc->summarizeSample((int) $sampleTest->sample_id);
        $qcStatus = strtolower((string) ($summary['status'] ?? 'pass'));

        if ($qcStatus === 'fail') {
            throw ValidationException::withMessages([
                'qc' => ['QC failed. Cannot verify until QC is resolved.'],
            ])->status(422);
        }

        // Apply verify
        $sampleTest->status = 'verified';
        $sampleTest->om_verified = true;
        $sampleTest->om_verified_at = now();
        $sampleTest->save();

        // Audit (reuse helper if you have auditDecision())
        if (method_exists($this, 'auditDecision')) {
            $this->auditDecision(
                $sampleTest,
                $request,
                $from,
                $sampleTest->status,
                $request->input('note')
            );
        }

        return response()->json([
            'message' => 'Sample test verified (OM).',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'status' => $sampleTest->status,
                'om_verified' => (bool) $sampleTest->om_verified,
                'om_verified_at' => $sampleTest->om_verified_at,
            ],
        ]);
    }

    public function validateAsLH(Request $request, SampleTest $sampleTest)
    {
        // RBAC: LH only
        $this->authorize('validateAsLH', $sampleTest);

        $request->validate([
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $from = (string) $sampleTest->status;

        // Idempotent: kalau sudah validated, jangan bikin error
        if ($from === 'validated') {
            return response()->json([
                'message' => 'Sample test already validated.',
                'data' => [
                    'sample_test_id' => $sampleTest->sample_test_id,
                    'status' => $sampleTest->status,
                    'lh_validated' => (bool) $sampleTest->lh_validated,
                    'lh_validated_at' => $sampleTest->lh_validated_at,
                ],
            ]);
        }

        // Transition rule: verified -> validated only
        if ($from !== 'verified') {
            throw ValidationException::withMessages([
                'status' => ["Invalid transition for validate: {$from} -> validated"],
            ])->status(422);
        }

        // QC GUARD (extra safety): tetap block kalau QC fail
        $qc = app(QcEvaluationService::class);
        $summary = $qc->summarizeSample((int) $sampleTest->sample_id);
        $qcStatus = strtolower((string) ($summary['status'] ?? 'pass'));

        if ($qcStatus === 'fail') {
            throw ValidationException::withMessages([
                'qc' => ['QC failed. Cannot validate until QC is resolved.'],
            ])->status(422);
        }

        // Apply validate
        $sampleTest->status = 'validated';
        $sampleTest->lh_validated = true;
        $sampleTest->lh_validated_at = now();
        $sampleTest->save();

        // Audit
        if (method_exists($this, 'auditDecision')) {
            $this->auditDecision(
                $sampleTest,
                $request,
                $from,
                $sampleTest->status,
                $request->input('note')
            );
        }

        return response()->json([
            'message' => 'Sample test validated (LH).',
            'data' => [
                'sample_test_id' => $sampleTest->sample_test_id,
                'status' => $sampleTest->status,
                'lh_validated' => (bool) $sampleTest->lh_validated,
                'lh_validated_at' => $sampleTest->lh_validated_at,
            ],
        ]);
    }
}
