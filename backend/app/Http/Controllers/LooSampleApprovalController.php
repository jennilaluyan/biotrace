<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LooSampleApprovalController extends Controller
{
    private function actorRoleCode(Staff $staff): ?string
    {
        return match ((int) $staff->role_id) {
            5 => 'OM',
            6 => 'LH',
            default => null,
        };
    }

    private function authenticatedStaff(): ?Staff
    {
        $staff = Auth::user();

        return $staff instanceof Staff ? $staff : null;
    }

    private function approvalsTableMissingResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'Approvals table not found. Run migrations.',
            'code' => 'APPROVALS_TABLE_MISSING',
        ], 500);
    }

    private function notEligibleResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'Sample is not eligible for LOO approval yet.',
            'code' => 'SAMPLE_NOT_ELIGIBLE',
        ], 422);
    }

    private function buildApprovalStateMap(array $sampleIds): array
    {
        $rows = DB::table('loo_sample_approvals')
            ->whereIn('sample_id', $sampleIds)
            ->whereIn('role_code', ['OM', 'LH'])
            ->get(['sample_id', 'role_code', 'approved_at']);

        $map = [];
        foreach ($sampleIds as $sampleId) {
            $map[$sampleId] = [
                'OM' => false,
                'LH' => false,
                'ready' => false,
            ];
        }

        foreach ($rows as $row) {
            $sampleId = (int) $row->sample_id;
            $roleCode = (string) $row->role_code;

            if (!isset($map[$sampleId])) {
                $map[$sampleId] = [
                    'OM' => false,
                    'LH' => false,
                    'ready' => false,
                ];
            }

            if ($roleCode === 'OM' || $roleCode === 'LH') {
                $map[$sampleId][$roleCode] = !empty($row->approved_at);
            }
        }

        foreach ($map as $sampleId => $state) {
            $map[$sampleId]['ready'] = (bool) (($state['OM'] ?? false) && ($state['LH'] ?? false));
        }

        return $map;
    }

    private function resolveApprovalTargets(Sample $sample, bool $applyToBatch): Collection
    {
        $query = Sample::query();

        if (
            $applyToBatch &&
            Schema::hasColumn('samples', 'request_batch_id') &&
            !empty($sample->request_batch_id)
        ) {
            $query
                ->where('client_id', $sample->client_id)
                ->where('request_batch_id', $sample->request_batch_id);

            if (Schema::hasColumn('samples', 'batch_excluded_at')) {
                $query->whereNull('batch_excluded_at');
            }

            return $query
                ->orderBy('request_batch_item_no')
                ->orderBy('sample_id')
                ->lockForUpdate()
                ->get();
        }

        return $query
            ->whereKey($sample->getKey())
            ->lockForUpdate()
            ->get();
    }

    private function upsertApprovalForTarget(Sample $target, Staff $staff, string $actorRole, bool $approved, $now): void
    {
        $existing = DB::table('loo_sample_approvals')
            ->where('sample_id', (int) $target->sample_id)
            ->where('role_code', $actorRole)
            ->first(['approval_id']);

        $payload = [
            'approved_by_staff_id' => $approved ? (int) $staff->staff_id : null,
            'approved_at' => $approved ? $now : null,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::table('loo_sample_approvals')
                ->where('sample_id', (int) $target->sample_id)
                ->where('role_code', $actorRole)
                ->update($payload);

            return;
        }

        DB::table('loo_sample_approvals')->insert([
            'sample_id' => (int) $target->sample_id,
            'role_code' => $actorRole,
            'approved_by_staff_id' => $approved ? (int) $staff->staff_id : null,
            'approved_at' => $approved ? $now : null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $staff = $this->authenticatedStaff();
        if (!$staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $actorRole = $this->actorRoleCode($staff);
        if (!$actorRole) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $request->validate([
            'sample_ids' => ['required', 'array', 'min:1'],
            'sample_ids.*' => ['integer', 'min:1', 'distinct'],
        ]);

        if (!Schema::hasTable('loo_sample_approvals')) {
            return $this->approvalsTableMissingResponse();
        }

        $sampleIds = array_values(array_unique(array_map('intval', (array) $request->input('sample_ids'))));

        return response()->json([
            'data' => $this->buildApprovalStateMap($sampleIds),
        ]);
    }

    public function update(Request $request, Sample $sample): JsonResponse
    {
        $staff = $this->authenticatedStaff();
        if (!$staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $actorRole = $this->actorRoleCode($staff);
        if (!$actorRole) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $request->validate([
            'approved' => ['required', 'boolean'],
            'apply_to_batch' => ['nullable', 'boolean'],
        ]);

        if (!Schema::hasTable('loo_sample_approvals')) {
            return $this->approvalsTableMissingResponse();
        }

        $approved = (bool) $request->boolean('approved');
        $applyToBatch = (bool) $request->boolean('apply_to_batch');

        return DB::transaction(function () use ($sample, $staff, $actorRole, $approved, $applyToBatch) {
            $targets = $this->resolveApprovalTargets($sample, $applyToBatch);

            if ($targets->isEmpty()) {
                return $this->notEligibleResponse();
            }

            foreach ($targets as $target) {
                if (empty($target->verified_at) || empty($target->lab_sample_code)) {
                    return $this->notEligibleResponse();
                }
            }

            $now = now();
            $affectedIds = [];

            foreach ($targets as $target) {
                $this->upsertApprovalForTarget($target, $staff, $actorRole, $approved, $now);
                $affectedIds[] = (int) $target->sample_id;
            }

            $primary = $targets->first();

            return response()->json([
                'message' => 'Approval updated.',
                'data' => [
                    'sample_id' => (int) $primary->sample_id,
                    'request_batch_id' => $primary->request_batch_id ?? null,
                    'affected_sample_ids' => $affectedIds,
                ],
            ]);
        }, 3);
    }
}
