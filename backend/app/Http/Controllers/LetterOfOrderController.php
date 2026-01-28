<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
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
            $loa = $this->svc->ensureDraftForSamples($sampleIds, (int) $staff->staff_id);
        } else {
            $loa = $this->svc->ensureDraftForSample($sampleId, (int) $staff->staff_id);
        }

        return response()->json([
            'message' => 'LoA generated.',
            'data' => $loa->loadMissing(['signatures', 'items']),
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
