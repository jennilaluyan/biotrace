<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleTestDecisionRequest;
use App\Models\AuditLog;
use App\Models\SampleTest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

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
}
