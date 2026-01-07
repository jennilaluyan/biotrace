<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Models\ReportSignature;
use App\Models\ReportSignatureRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class ReportSignatureController extends Controller
{
    public function sign(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'role_code' => ['required', 'string', 'max:24'],
        ]);

        $roleCode = strtoupper(trim((string) $request->input('role_code')));

        // ✅ role_code harus terdaftar di table report_signature_roles
        $allowed = ReportSignatureRole::query()
            ->where('role_code', $roleCode)
            ->exists();

        if (!$allowed) {
            return response()->json(['message' => 'Invalid role_code.'], 422);
        }

        $staff = Auth::user();
        $actorStaffId = (int) ($staff->staff_id ?? $staff->id ?? 0);

        $actorRoleId = (int) (
            $staff->role_id
            ?? ($staff->role->role_id ?? null)
            ?? ($staff->role->id ?? null)
            ?? 0
        );

        $actorRoleCode = $this->mapRoleIdToSignatureCode($actorRoleId);

        // ✅ OM hanya boleh sign OM, LH hanya boleh sign LH
        if (!$actorRoleCode || $actorRoleCode !== $roleCode) {
            return response()->json(['message' => 'Forbidden for this role_code.'], 403);
        }

        $report = Report::query()->where('report_id', $id)->first();
        if (!$report) {
            return response()->json(['message' => 'Report not found.'], 404);
        }

        // ✅ kalau slot signature belum ada (mis report lama dulu ada QA_MANAGER), auto-create slot baru
        $signature = ReportSignature::query()
            ->where('report_id', $id)
            ->where('role_code', $roleCode)
            ->first();

        if ($signature && $signature->signed_by) {
            return response()->json(['message' => 'Already signed.'], 409);
        }

        if (!$signature) {
            $signature = ReportSignature::query()->create([
                'report_id' => $id,
                'role_code' => $roleCode,
                'signed_by' => null,
                'signed_at' => null,
                'signature_hash' => null,
                'note' => null,
                'created_at' => now(),
                'updated_at' => null,
            ]);
        }

        $signature->signed_by = $actorStaffId;
        $signature->signed_at = now();
        $signature->signature_hash = hash('sha256', Str::uuid()->toString());
        $signature->updated_at = now();
        $signature->save();

        return response()->json([
            'message' => 'Signed.',
            'data' => [
                'signature' => $signature,
            ],
        ], 200);
    }

    private function mapRoleIdToSignatureCode(int $roleId): ?string
    {
        // role_id sesuai RoleSeeder kamu
        return match ($roleId) {
            5 => 'OM',
            6 => 'LH',
            default => null,
        };
    }
}
