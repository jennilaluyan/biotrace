<?php

namespace App\Http\Controllers;

use App\Http\Requests\QcRunStoreRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Models\QcRun;
use App\Services\QcEvaluationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class QcRunController extends Controller
{
    public function store(QcRunStoreRequest $request, Sample $sample, QcEvaluationService $svc): JsonResponse
    {
        $batchId = (int) $sample->getAttribute('sample_id');

        // get actor staff_id (pattern sama seperti bulk controller kamu)
        $user = Auth::user();
        $actorStaffId = 0;

        if ($user && isset($user->staff_id) && is_numeric($user->staff_id)) {
            $actorStaffId = (int) $user->staff_id;
        } elseif ($user && method_exists($user, 'staff') && $user->staff && isset($user->staff->staff_id)) {
            $actorStaffId = (int) $user->staff->staff_id;
        } elseif ($user) {
            $actorStaffId = (int) Staff::query()->where('user_id', $user->id)->value('staff_id');
        }

        if ($actorStaffId <= 0) {
            return response()->json([
                'status' => 422,
                'message' => 'Missing actor staff_id.',
            ], 422);
        }

        $qcControlId = (int) $request->validated()['qc_control_id'];
        $value = (float) $request->validated()['value'];

        $run = $svc->evaluateAndPersist($batchId, $qcControlId, $value, $actorStaffId);
        $summary = $svc->summarizeBatch($batchId);

        return response()->json([
            'status' => 200,
            'message' => 'QC run recorded.',
            'data' => [
                'sample_id' => $batchId,
                'qc_run' => $run,
                'summary' => $summary,
            ],
        ], 200);
    }

    public function summary(Sample $sample, QcEvaluationService $svc): JsonResponse
    {
        $batchId = (int) $sample->getAttribute('sample_id');
        $summary = $svc->summarizeBatch($batchId);

        // return last N runs (paginated-lite)
        $runs = QcRun::query()
            ->select(['qc_run_id', 'batch_id', 'qc_control_id', 'value', 'z_score', 'violations', 'status', 'created_by', 'created_at'])
            ->where('batch_id', $batchId)
            ->orderByDesc('qc_run_id')
            ->limit(50)
            ->get();

        return response()->json([
            'status' => 200,
            'message' => 'QC summary retrieved.',
            'data' => [
                'sample_id' => $batchId,
                'summary' => $summary,
                'qc_runs' => $runs,
            ],
        ], 200);
    }
}
