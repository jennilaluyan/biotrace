<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReportSignRequest;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReportSignatureController extends Controller
{
    /**
     * POST /api/v1/reports/{id}/sign
     * Body: { "role_code": "QA_MANAGER" | "LH", "note": "..." }
     */
    public function sign(ReportSignRequest $request, int $id): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $actorStaffId = (int) ($user->staff_id ?? 0);
        if ($actorStaffId <= 0) {
            return response()->json(['message' => 'Invalid actor staff id.'], 422);
        }

        $roleCode = strtoupper(trim((string) $request->input('role_code')));
        $note = $request->input('note');

        $report = Report::query()->where('report_id', $id)->first();
        if (!$report) {
            return response()->json(['message' => 'Report not found.'], 404);
        }

        // (Optional) If you later decide to lock report, block signing when locked:
        // if ((bool) $report->is_locked) return response()->json(['message' => 'Report is locked.'], 423);

        // Validate role_code exists in infra table
        $roleExists = DB::table('report_signature_roles')
            ->where('role_code', $roleCode)
            ->exists();

        if (!$roleExists) {
            return response()->json(['message' => 'Invalid role_code.'], 422);
        }

        // RBAC: allow only correct staff role to sign
        if (!$this->canSignRoleCode($actorStaffId, $roleCode)) {
            return response()->json(['message' => 'Forbidden for this role_code.'], 403);
        }

        // Find signature slot
        $slot = DB::table('report_signatures')
            ->where('report_id', $id)
            ->where('role_code', $roleCode)
            ->first();

        if (!$slot) {
            return response()->json(['message' => 'Signature slot not found for this role_code.'], 404);
        }

        if (!empty($slot->signed_at)) {
            return response()->json(['message' => 'This role_code is already signed.'], 409);
        }

        $signatureHash = hash('sha256', $id . '|' . $roleCode . '|' . $actorStaffId . '|' . now()->toISOString() . '|' . Str::uuid());

        DB::table('report_signatures')
            ->where('signature_id', $slot->signature_id)
            ->update([
                'signed_by' => $actorStaffId,
                'signed_at' => now(),
                'signature_hash' => $signatureHash,
                'note' => $note,
                'updated_at' => now(),
            ]);

        $updated = DB::table('report_signatures')
            ->where('signature_id', $slot->signature_id)
            ->first();

        return response()->json([
            'message' => 'Signed.',
            'data' => $updated,
        ], 200);
    }

    /**
     * Minimal RBAC mapping:
     * - QA_MANAGER => Operational Manager (OM) OR Admin
     * - LH        => Lab Head OR Admin
     *
     * We avoid hardcoding role_id. We read roles.name by role_id.
     */
    private function canSignRoleCode(int $staffId, string $roleCode): bool
    {
        $staff = DB::table('staffs')->where('staff_id', $staffId)->first();
        if (!$staff || empty($staff->role_id)) {
            return false;
        }

        $role = DB::table('roles')->where('role_id', (int) $staff->role_id)->first();
        $roleName = strtoupper((string) ($role->name ?? ''));

        // Admin can sign anything (MVP convenience)
        if ($roleName === 'ADMIN') {
            return true;
        }

        if ($roleCode === 'QA_MANAGER') {
            // On your system this is typically "OPERATIONAL_MANAGER"
            return in_array($roleName, ['OPERATIONAL_MANAGER', 'QA_MANAGER'], true);
        }

        if ($roleCode === 'LH') {
            return in_array($roleName, ['LAB_HEAD', 'LH'], true);
        }

        return false;
    }
}
