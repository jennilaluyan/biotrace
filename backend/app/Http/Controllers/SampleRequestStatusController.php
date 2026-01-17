<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleRequestStatusUpdateRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\AuditLogger;
use App\Support\SampleRequestStatusTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class SampleRequestStatusController extends Controller
{
    /**
     * POST /api/v1/samples/{sample}/request-status
     */
    public function update(SampleRequestStatusUpdateRequest $request, Sample $sample): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $target = (string) $request->input('target_status');
        $note   = $request->input('note');

        // Policy: siapa boleh mencoba update request status
        $this->authorize('updateRequestStatus', [$sample, $target]);

        $current = (string) $sample->request_status;

        if ($current === $target) {
            return response()->json([
                'message' => 'Sample request already in the requested status.',
            ], 400);
        }

        // Transition check (role-based + from/to)
        if (!SampleRequestStatusTransitions::canTransition($staff, $sample, $target)) {
            return response()->json([
                'message' => 'You are not allowed to perform this request status transition.',
            ], 403);
        }

        $old = $current;

        // Apply timestamps automation
        if ($target === 'submitted' && empty($sample->submitted_at)) {
            $sample->submitted_at = now();
        }

        if ($target === 'physically_received' && empty($sample->physically_received_at)) {
            $sample->physically_received_at = now();
        }

        $sample->request_status = $target;
        $sample->save();

        // Audit
        AuditLogger::logSampleRequestStatusChanged(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $sample->sample_id,
            clientId: (int) $sample->client_id,
            oldStatus: $old,
            newStatus: $target,
            note: $note
        );

        $sample->refresh();

        return response()->json([
            'message' => 'Sample request status updated successfully.',
            'data' => $sample,
        ], 200);
    }
}
