<?php

namespace App\Http\Controllers;

use App\Enums\SampleRequestStatus;
use App\Http\Requests\SampleVerifyRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SampleVerificationController extends Controller
{
    private function resolveSampleIdPrefix(?string $workflowGroup): ?string
    {
        $g = strtolower(trim((string) $workflowGroup));
        if ($g === '') return null;

        $g = str_replace([' ', '-'], '_', $g);
        $g = preg_replace('/_+/', '_', $g);

        if ($g === 'pcr_sars_cov_2') return 'USR';
        if ($g === 'wgs_sars_cov_2') return 'WGS';
        if ($g === 'group_19_22') return 'BML';
        if ($g === 'group_23_32') return 'BML';
        if (str_contains($g, 'antigen')) return 'LBMA';

        return null;
    }

    private function resolveVerifiedByRole(Staff $actor): ?string
    {
        $roleName = strtolower(trim((string) ($actor->role?->name ?? '')));

        if (
            str_contains($roleName, 'operational manager') ||
            $roleName === 'om' ||
            str_contains($roleName, 'operational_manager')
        ) {
            return 'OM';
        }

        if (
            str_contains($roleName, 'laboratory head') ||
            str_contains($roleName, 'lab head') ||
            $roleName === 'lh' ||
            str_contains($roleName, 'laboratory_head') ||
            str_contains($roleName, 'lab_head')
        ) {
            return 'LH';
        }

        return null;
    }

    public function verify(SampleVerifyRequest $request, Sample $sample): JsonResponse
    {
        $actor = $request->user();

        if (!$actor instanceof Staff) {
            return response()->json([
                'status' => 403,
                'code' => 'LIMS.AUTH.FORBIDDEN',
                'message' => 'Forbidden.',
            ], 403);
        }

        $this->authorize('verifySampleRequest', $sample);

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

        if ((bool) ($checklist->is_passed ?? false) !== true) {
            return response()->json([
                'status' => 422,
                'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                'message' => 'Only PASSED checklists can be verified.',
                'details' => [
                    ['field' => 'intake_checklist.is_passed', 'message' => 'Checklist is not passed.'],
                ],
            ], 422);
        }

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

        $verifiedByRole = $this->resolveVerifiedByRole($actor);
        if ($verifiedByRole === null) {
            return response()->json([
                'status' => 403,
                'code' => 'LIMS.AUTH.FORBIDDEN',
                'message' => 'Forbidden.',
            ], 403);
        }

        $note = $request->validated()['note'] ?? null;
        $now = Carbon::now();
        $actorStaffId = (int) (($actor->staff_id ?? null) ?: ($actor->id ?? 0));

        $old = [
            'verified_at' => $sample->verified_at,
            'verified_by_staff_id' => $sample->verified_by_staff_id,
            'verified_by_role' => $sample->verified_by_role,
            'request_status' => $sample->request_status,
            'lab_sample_code' => $sample->lab_sample_code,
            'sample_id_prefix' => $sample->sample_id_prefix,
        ];

        DB::transaction(function () use ($sample, $actorStaffId, $now, $verifiedByRole) {
            $sample->verified_at = $now;
            $sample->verified_by_staff_id = $actorStaffId;
            $sample->verified_by_role = $verifiedByRole;

            $sample->request_status = SampleRequestStatus::WAITING_SAMPLE_ID_ASSIGNMENT->value;

            if (empty($sample->sample_id_prefix)) {
                $prefix = $this->resolveSampleIdPrefix($sample->workflow_group);
                if ($prefix) {
                    $sample->sample_id_prefix = $prefix;
                }
            }

            $sample->save();
        }, 3);

        $sample->refresh();

        AuditLogger::logSampleRequestVerified(
            staffId: $actorStaffId,
            sampleId: (int) $sample->sample_id,
            clientId: (int) ($sample->client_id ?? 0),
            verifiedByRole: (string) ($sample->verified_by_role ?? $verifiedByRole),
            oldValues: $old,
            newValues: [
                'verified_at' => $sample->verified_at,
                'verified_by_staff_id' => $sample->verified_by_staff_id,
                'verified_by_role' => $sample->verified_by_role,
                'request_status' => $sample->request_status,
                'lab_sample_code' => $sample->lab_sample_code,
                'sample_id_prefix' => $sample->sample_id_prefix,
            ],
            note: is_string($note) && trim($note) !== '' ? trim($note) : null
        );

        return response()->json([
            'message' => 'Verified.',
            'data' => $sample->fresh(),
        ], 200);
    }
}
