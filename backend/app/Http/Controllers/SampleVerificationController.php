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

        // ✅ Canonical workflow groups
        if ($g === 'pcr') return 'USR';
        if ($g === 'sequencing') return 'WGS';
        if ($g === 'rapid') return 'LBMA';
        if ($g === 'microbiology') return 'BML';

        // ✅ Legacy aliases (keep backward compatibility)
        if ($g === 'pcr_sars_cov_2') return 'USR';
        if ($g === 'wgs_sars_cov_2') return 'WGS';
        if ($g === 'group_19_22' || $g === 'group_23_32') return 'BML';
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

        $applyToBatch = filter_var((string) $request->input('apply_to_batch', '0'), FILTER_VALIDATE_BOOLEAN);

        $targets = DB::transaction(function () use ($sample, $applyToBatch) {
            $query = Sample::query()->with('intakeChecklist');

            if (
                $applyToBatch &&
                !empty($sample->request_batch_id) &&
                \Illuminate\Support\Facades\Schema::hasColumn('samples', 'request_batch_id')
            ) {
                $query
                    ->where('client_id', $sample->client_id)
                    ->where('request_batch_id', $sample->request_batch_id);

                if (\Illuminate\Support\Facades\Schema::hasColumn('samples', 'batch_excluded_at')) {
                    $query->whereNull('batch_excluded_at');
                }

                return $query
                    ->orderBy('request_batch_item_no')
                    ->orderBy('sample_id')
                    ->lockForUpdate()
                    ->get();
            }

            return $query->whereKey($sample->getKey())->lockForUpdate()->get();
        });

        foreach ($targets as $target) {
            $rs = (string) ($target->request_status ?? '');

            if ($rs !== SampleRequestStatus::AWAITING_VERIFICATION->value) {
                return response()->json([
                    'status' => 422,
                    'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                    'message' => 'Sample can only be verified when request_status is awaiting_verification.',
                    'details' => [
                        ['field' => 'request_status', 'message' => "Sample {$target->sample_id}: {$rs}"],
                    ],
                ], 422);
            }

            $checklist = $target->intakeChecklist;
            if (!$checklist || (bool) ($checklist->is_passed ?? false) !== true) {
                return response()->json([
                    'status' => 422,
                    'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                    'message' => 'Only PASSED checklists can be verified.',
                    'details' => [
                        ['field' => 'intake_checklist', 'message' => "Sample {$target->sample_id} is not passed."],
                    ],
                ], 422);
            }

            if (!empty($target->verified_at)) {
                return response()->json([
                    'status' => 409,
                    'code' => 'LIMS.RESOURCE.CONFLICT',
                    'message' => "Sample {$target->sample_id} has already been verified.",
                ], 409);
            }
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
        $affectedIds = [];

        DB::transaction(function () use ($targets, $actorStaffId, $now, $verifiedByRole, &$affectedIds) {
            foreach ($targets as $target) {
                if (empty($target->sample_id_prefix)) {
                    $prefix = $this->resolveSampleIdPrefix($target->workflow_group);
                    if ($prefix) {
                        $target->sample_id_prefix = $prefix;
                    }
                }

                $target->verified_at = $now;
                $target->verified_by_staff_id = $actorStaffId;
                $target->verified_by_role = $verifiedByRole;
                $target->request_status = SampleRequestStatus::WAITING_SAMPLE_ID_ASSIGNMENT->value;
                $target->save();

                $affectedIds[] = (int) $target->sample_id;
            }
        }, 3);

        $primary = collect($targets)->sortBy(fn(Sample $row) => (int) ($row->request_batch_item_no ?? 1))->first()?->fresh();

        return response()->json([
            'message' => 'Verified.',
            'data' => $primary,
            'meta' => [
                'request_batch_id' => $primary?->request_batch_id ?? null,
                'affected_sample_ids' => $affectedIds,
                'batch_total' => count($affectedIds),
                'intake_preview' => collect($targets)->map(fn(Sample $row) => [
                    'sample_id' => (int) $row->sample_id,
                    'item_no' => (int) ($row->request_batch_item_no ?? 1),
                    'is_passed' => (bool) ($row->intakeChecklist?->is_passed ?? false),
                    'notes' => $row->intakeChecklist?->notes,
                ])->values()->all(),
            ],
        ], 200);
    }
}
