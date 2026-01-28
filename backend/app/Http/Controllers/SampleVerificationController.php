<?php

namespace App\Http\Controllers;

use App\Enums\SampleRequestStatus;
use App\Http\Requests\SampleVerifyRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SampleVerificationController extends Controller
{
    /**
     * POST /api/v1/samples/{sample}/verify
     * body: { note? }
     *
     * Rules:
     * - only OM/LH
     * - request_status must be awaiting_verification
     * - intake checklist must exist and passed
     * - cannot verify twice
     */
    public function verify(SampleVerifyRequest $request, Sample $sample): JsonResponse
    {
        /** @var mixed $actor */
        $actor = $request->user();

        // Hard guard: staff only
        if (!$actor instanceof Staff) {
            return response()->json([
                'status' => 403,
                'code' => 'LIMS.AUTH.FORBIDDEN',
                'message' => 'Forbidden.',
            ], 403);
        }

        // Policy: only OM/LH
        $this->authorize('verifySampleRequest', $sample);

        // Must be in awaiting_verification
        $rs = (string) ($sample->request_status ?? '');
        if ($rs !== SampleRequestStatus::AWAITING_VERIFICATION->value) {
            return response()->json([
                'status' => 422,
                'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                'message' => 'Sample can only be verified when request_status is awaiting_verification.',
                'details' => [
                    ['field' => 'request_status', 'message' => "Current: {$rs}"],
                ],
            ], 422);
        }

        // Must have checklist and passed
        $sample->load('intakeChecklist');
        $checklist = $sample->intakeChecklist;
        if (!$checklist) {
            return response()->json([
                'status' => 422,
                'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                'message' => 'Intake checklist must exist before verification.',
                'details' => [
                    ['field' => 'intake_checklist', 'message' => 'Missing intake checklist.'],
                ],
            ], 422);
        }
        if ((bool)($checklist->is_passed ?? false) !== true) {
            return response()->json([
                'status' => 422,
                'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                'message' => 'Only PASSED checklists can be verified.',
                'details' => [
                    ['field' => 'intake_checklist.is_passed', 'message' => 'Checklist is not passed.'],
                ],
            ], 422);
        }

        // Cannot verify twice (first verifier wins)
        if (!empty($sample->verified_at)) {
            return response()->json([
                'status' => 409,
                'code' => 'LIMS.RESOURCE.CONFLICT',
                'message' => 'This sample request has already been verified.',
                'details' => [
                    ['field' => 'verified_at', 'message' => 'Already verified.'],
                ],
            ], 409);
        }

        // Normalize role → OM/LH
        $roleName = strtolower(trim((string) ($actor->role?->name ?? '')));
        $verifiedByRole = null;

        // tolerate variants
        if (str_contains($roleName, 'operational manager') || $roleName === 'om' || str_contains($roleName, 'operational_manager')) {
            $verifiedByRole = 'OM';
        }
        if (str_contains($roleName, 'laboratory head') || str_contains($roleName, 'lab head') || $roleName === 'lh' || str_contains($roleName, 'laboratory_head') || str_contains($roleName, 'lab_head')) {
            $verifiedByRole = 'LH';
        }

        if ($verifiedByRole === null) {
            // extra safety (should not happen due to policy)
            return response()->json([
                'status' => 403,
                'code' => 'LIMS.AUTH.FORBIDDEN',
                'message' => 'Forbidden.',
            ], 403);
        }

        $note = $request->validated()['note'] ?? null;

        // Capture old values for audit
        $old = [
            'verified_at' => $sample->verified_at,
            'verified_by_staff_id' => $sample->verified_by_staff_id,
            'verified_by_role' => $sample->verified_by_role,
            'request_status' => $sample->request_status,
        ];

        DB::transaction(function () use ($sample, $actor, $verifiedByRole) {
            $sample->verified_at = now();
            $sample->verified_by_staff_id = (int) ($actor->staff_id ?? $actor->getKey());
            $sample->verified_by_role = $verifiedByRole;
            $sample->save();
        });

        $sample->refresh();

        // Audit log
        AuditLogger::logSampleRequestVerified(
            staffId: (int) ($actor->staff_id ?? $actor->getKey()),
            sampleId: (int) $sample->sample_id,
            clientId: (int) $sample->client_id,
            verifiedByRole: (string) $sample->verified_by_role,
            oldValues: $old,
            newValues: [
                'verified_at' => $sample->verified_at,
                'verified_by_staff_id' => $sample->verified_by_staff_id,
                'verified_by_role' => $sample->verified_by_role,
                'request_status' => $sample->request_status,
            ],
            note: is_string($note) && trim($note) !== '' ? trim($note) : null
        );

        return response()->json([
            'message' => 'Verified.',
            'data' => $sample->fresh(),
        ], 200);
    }
}
