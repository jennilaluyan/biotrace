<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use App\Services\LetterOfOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class LetterOfOrderController extends Controller
{
    public function __construct(private readonly LetterOfOrderService $svc) {}

    private function assertStaffRoleAllowed(Staff $staff, array $allowedRoleIds): void
    {
        if (!in_array((int) $staff->role_id, $allowedRoleIds, true)) {
            abort(403, 'Forbidden.');
        }
    }

    public function generate(Request $request, int $sampleId): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        // OM(5) / LH(6)
        $this->assertStaffRoleAllowed($staff, [5, 6]);

        // ✅ NEW: allow bulk generation using sample_ids[]
        $request->validate([
            'sample_ids' => ['nullable', 'array', 'min:1'],
            'sample_ids.*' => ['integer', 'min:1', 'distinct'],
        ]);

        $sampleIds = $request->input('sample_ids');

        if (is_array($sampleIds) && count($sampleIds) > 0) {
            $sampleIds = array_values(array_unique(array_map('intval', $sampleIds)));

            // Step 2: Only include samples that are approved by BOTH OM & LH (intersection)
            if (!\Illuminate\Support\Facades\Schema::hasTable('loo_sample_approvals')) {
                return response()->json([
                    'message' => 'Approvals table not found. Run migrations.',
                    'code' => 'APPROVALS_TABLE_MISSING',
                ], 500);
            }

            $rows = \Illuminate\Support\Facades\DB::table('loo_sample_approvals')
                ->whereIn('sample_id', $sampleIds)
                ->whereIn('role_code', ['OM', 'LH'])
                ->whereNotNull('approved_at')
                ->get(['sample_id', 'role_code']);

            $seen = [];
            foreach ($rows as $r) {
                $sid = (int) $r->sample_id;
                $rc  = (string) $r->role_code;
                if (!isset($seen[$sid])) $seen[$sid] = ['OM' => false, 'LH' => false];
                if ($rc === 'OM' || $rc === 'LH') $seen[$sid][$rc] = true;
            }

            $readyIds = [];
            foreach ($seen as $sid => $st) {
                if (!empty($st['OM']) && !empty($st['LH'])) $readyIds[] = (int) $sid;
            }

            if (count($readyIds) <= 0) {
                return response()->json([
                    'message' => 'Tidak ada sampel yang sudah disetujui oleh OM dan LH.',
                    'code' => 'NO_READY_SAMPLES',
                ], 422);
            }

            $loa = $this->svc->ensureDraftForSamples($readyIds, (int) $staff->staff_id);

            // Attach info for frontend clarity
            $loa->setAttribute('included_sample_ids', $readyIds);
        } else {
            // single-sample legacy route: still enforce approval intersection for that sample
            $sid = (int) $sampleId;

            if (!\Illuminate\Support\Facades\Schema::hasTable('loo_sample_approvals')) {
                return response()->json([
                    'message' => 'Approvals table not found. Run migrations.',
                    'code' => 'APPROVALS_TABLE_MISSING',
                ], 500);
            }

            $approvedRoles = \Illuminate\Support\Facades\DB::table('loo_sample_approvals')
                ->where('sample_id', $sid)
                ->whereIn('role_code', ['OM', 'LH'])
                ->whereNotNull('approved_at')
                ->pluck('role_code')
                ->map(fn($x) => (string) $x)
                ->all();

            $om = in_array('OM', $approvedRoles, true);
            $lh = in_array('LH', $approvedRoles, true);

            if (!($om && $lh)) {
                return response()->json([
                    'message' => 'Sample ini belum disetujui oleh OM dan LH.',
                    'code' => 'SAMPLE_NOT_READY',
                ], 422);
            }

            $loa = $this->svc->ensureDraftForSample($sid, (int) $staff->staff_id);
            $loa->setAttribute('included_sample_ids', [$sid]);
        }

        $loa = $loa->loadMissing(['signatures', 'items']);

        // expose only via API endpoint (private file)
        $downloadUrl = url("/api/v1/reports/documents/loo/{$loa->lo_id}/pdf");

        // Attach transient attributes so frontend can use them
        $loa->setAttribute('download_url', $downloadUrl);
        $loa->setAttribute('pdf_url', $downloadUrl);

        return response()->json([
            'message' => 'LoO generated.',
            'data' => $loa,
        ], 201);
    }

    public function signInternal(Request $request, int $loaId): JsonResponse
    {
        $request->validate([
            'role_code' => ['required', 'string', 'max:24'],
        ]);

        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $roleCode = strtoupper(trim((string) $request->input('role_code')));

        // map role_id -> allowed sign code (consistent with ReportSignatureController)
        $actorRoleCode = match ((int) $staff->role_id) {
            5 => 'OM',
            6 => 'LH',
            default => null,
        };

        if (!$actorRoleCode || $actorRoleCode !== $roleCode) {
            return response()->json(['message' => 'Forbidden for this role_code.'], 403);
        }

        $loa = $this->svc->signInternal($loaId, (int) $staff->staff_id, $roleCode);

        return response()->json([
            'message' => 'Signed.',
            'data' => $loa->loadMissing(['signatures']),
        ]);
    }

    public function sendToClient(Request $request, int $loaId): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        // send: OM only
        $this->assertStaffRoleAllowed($staff, [5]);

        $loa = $this->svc->sendToClient($loaId, (int) $staff->staff_id);

        return response()->json([
            'message' => 'Sent to client.',
            'data' => $loa,
        ]);
    }
}
