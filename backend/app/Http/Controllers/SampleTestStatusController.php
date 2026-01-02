<?php

namespace App\Http\Controllers;

use App\Models\SampleTest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SampleTestStatusController extends Controller
{
    public function update(Request $request, SampleTest $sampleTest): JsonResponse
    {
        // RBAC (Analyst only) - sesuaikan nama ability/policy kamu
        $this->authorize('updateStatusAsAnalyst', $sampleTest);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:in_progress,testing_completed,failed'],
        ]);

        $from = $sampleTest->status;

        // Guard transisi (Step 8)
        $allowed = [
            'queued' => ['in_progress'],
            'in_progress' => ['testing_completed', 'failed'],
        ];

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
        if ($from === 'queued' && $data['status'] === 'in_progress' && !$sampleTest->started_at) {
            $sampleTest->started_at = now();
        }

        if ($data['status'] === 'testing_completed' && !$sampleTest->completed_at) {
            $sampleTest->completed_at = now();
        }

        $sampleTest->status = $data['status'];
        $sampleTest->save();

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
