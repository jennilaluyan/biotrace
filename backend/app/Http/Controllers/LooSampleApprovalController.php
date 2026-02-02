<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LooSampleApprovalController extends Controller
{
    private function actorRoleCode(Staff $staff): ?string
    {
        // match LetterOfOrderController mapping
        return match ((int) $staff->role_id) {
            5 => 'OM',
            6 => 'LH',
            default => null,
        };
    }

    /**
     * GET /api/v1/loo/approvals?sample_ids[]=1&sample_ids[]=2
     * Returns: { data: { [sample_id]: { OM: bool, LH: bool, ready: bool } } }
     */
    public function index(Request $request): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
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

        $sampleIds = array_values(array_unique(array_map('intval', (array) $request->input('sample_ids'))));

        if (!Schema::hasTable('loo_sample_approvals')) {
            return response()->json([
                'message' => 'Approvals table not found. Run migrations.',
                'code' => 'APPROVALS_TABLE_MISSING',
            ], 500);
        }

        $rows = DB::table('loo_sample_approvals')
            ->whereIn('sample_id', $sampleIds)
            ->whereIn('role_code', ['OM', 'LH'])
            ->get(['sample_id', 'role_code', 'approved_at']);

        $map = [];
        foreach ($sampleIds as $sid) {
            $map[$sid] = ['OM' => false, 'LH' => false, 'ready' => false];
        }

        foreach ($rows as $r) {
            $sid = (int) $r->sample_id;
            $rc  = (string) $r->role_code;
            $ok  = !empty($r->approved_at);

            if (!isset($map[$sid])) $map[$sid] = ['OM' => false, 'LH' => false, 'ready' => false];
            if ($rc === 'OM' || $rc === 'LH') {
                $map[$sid][$rc] = (bool) $ok;
            }
        }

        foreach ($map as $sid => $st) {
            $map[$sid]['ready'] = (bool) (($st['OM'] ?? false) && ($st['LH'] ?? false));
        }

        return response()->json(['data' => $map]);
    }

    /**
     * PATCH /api/v1/loo/approvals/{sample}
     * body: { approved: boolean }
     *
     * Actor can ONLY set their own role approval (OM sets OM, LH sets LH).
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $actorRole = $this->actorRoleCode($staff);
        if (!$actorRole) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $request->validate([
            'approved' => ['required', 'boolean'],
        ]);

        if (!Schema::hasTable('loo_sample_approvals')) {
            return response()->json([
                'message' => 'Approvals table not found. Run migrations.',
                'code' => 'APPROVALS_TABLE_MISSING',
            ], 500);
        }

        $approved = (bool) $request->boolean('approved');

        return DB::transaction(function () use ($sample, $staff, $actorRole, $approved) {
            // Ensure sample is a valid LOO candidate (verified + has lab_sample_code)
            if (empty($sample->verified_at) || empty($sample->lab_sample_code)) {
                return response()->json([
                    'message' => 'Sample is not eligible for LOO approval yet.',
                    'code' => 'SAMPLE_NOT_ELIGIBLE',
                ], 422);
            }

            // Upsert approval row for (sample_id, role_code)
            $now = now();

            $existing = DB::table('loo_sample_approvals')
                ->where('sample_id', (int) $sample->sample_id)
                ->where('role_code', $actorRole)
                ->first(['approval_id']);

            if ($existing) {
                DB::table('loo_sample_approvals')
                    ->where('sample_id', (int) $sample->sample_id)
                    ->where('role_code', $actorRole)
                    ->update([
                        'approved_by_staff_id' => $approved ? (int) $staff->staff_id : null,
                        'approved_at' => $approved ? $now : null,
                        'updated_at' => $now,
                    ]);
            } else {
                DB::table('loo_sample_approvals')->insert([
                    'sample_id' => (int) $sample->sample_id,
                    'role_code' => $actorRole,
                    'approved_by_staff_id' => $approved ? (int) $staff->staff_id : null,
                    'approved_at' => $approved ? $now : null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            // Return fresh state for this sample
            $rows = DB::table('loo_sample_approvals')
                ->where('sample_id', (int) $sample->sample_id)
                ->whereIn('role_code', ['OM', 'LH'])
                ->get(['role_code', 'approved_at']);

            $state = ['OM' => false, 'LH' => false, 'ready' => false];
            foreach ($rows as $r) {
                $rc = (string) $r->role_code;
                $state[$rc] = !empty($r->approved_at);
            }
            $state['ready'] = (bool) (($state['OM'] ?? false) && ($state['LH'] ?? false));

            return response()->json([
                'message' => 'Approval updated.',
                'data' => [
                    'sample_id' => (int) $sample->sample_id,
                    'state' => $state,
                ],
            ]);
        }, 3);
    }
}
