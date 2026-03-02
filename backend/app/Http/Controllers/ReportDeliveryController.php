<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportDeliveryController extends Controller
{
    // Samakan dengan komentar di ReportDocumentsController: Admin=2
    private const ADMIN_ROLE_ID = 2;

    private function assertAdminOr403(): void
    {
        $user = Auth::user();
        $roleId = (int) ($user?->role_id ?? 0);
        if ($roleId !== self::ADMIN_ROLE_ID) {
            abort(403, 'Only Admin can perform this action.');
        }
    }

    private function loadReportOr404(int $reportId): object
    {
        $r = DB::table('reports')->where('report_id', $reportId)->first();
        if (!$r) abort(404, 'Report not found.');
        return $r;
    }

    /**
     * POST /api/v1/reports/{report}/coa-check
     * Admin marks COA as checked (no sending yet).
     */
    public function markCoaChecked(Request $request, int $report): JsonResponse
    {
        $this->assertAdminOr403();

        $now = now();
        $staffId = (int) (Auth::user()?->staff_id ?? 0);

        $r = $this->loadReportOr404($report);

        if (!($r->is_locked ?? false)) {
            return response()->json(['message' => 'Report must be finalized/locked first.'], 409);
        }

        if (!Schema::hasColumn('reports', 'coa_checked_at')) {
            return response()->json(['message' => 'Server missing COA check fields. Run migrations.'], 500);
        }

        DB::table('reports')
            ->where('report_id', $report)
            ->update([
                'coa_checked_at' => $now,
                'coa_checked_by_staff_id' => Schema::hasColumn('reports', 'coa_checked_by_staff_id') ? $staffId : null,
                'updated_at' => $now,
            ]);

        $updated = $this->loadReportOr404($report);

        return response()->json([
            'message' => 'COA marked as checked.',
            'data' => $updated,
        ], 200);
    }

    /**
     * POST /api/v1/reports/{report}/release-coa
     * Admin releases COA to client (this is the “send” gate).
     */
    public function releaseCoaToClient(Request $request, int $report): JsonResponse
    {
        $this->assertAdminOr403();

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:4000'],
        ]);

        $now = now();
        $staffId = (int) (Auth::user()?->staff_id ?? 0);

        $r = $this->loadReportOr404($report);

        if (!($r->is_locked ?? false)) {
            return response()->json(['message' => 'Report must be finalized/locked first.'], 409);
        }

        if (!Schema::hasColumn('reports', 'coa_released_to_client_at')) {
            return response()->json(['message' => 'Server missing COA release fields. Run migrations.'], 500);
        }

        // Idempotent: if already released, just return
        if (!empty($r->coa_released_to_client_at)) {
            return response()->json([
                'message' => 'COA already released to client.',
                'data' => $r,
            ], 200);
        }

        DB::transaction(function () use ($report, $now, $staffId, $data) {
            $patch = [
                'coa_released_to_client_at' => $now,
                'updated_at' => $now,
            ];

            if (Schema::hasColumn('reports', 'coa_released_to_client_by_staff_id')) {
                $patch['coa_released_to_client_by_staff_id'] = $staffId;
            }
            if (Schema::hasColumn('reports', 'coa_release_note')) {
                $patch['coa_release_note'] = $data['note'] ?? null;
            }

            // Auto-check if not checked yet
            if (Schema::hasColumn('reports', 'coa_checked_at')) {
                $patch['coa_checked_at'] = $now;
            }
            if (Schema::hasColumn('reports', 'coa_checked_by_staff_id')) {
                $patch['coa_checked_by_staff_id'] = $staffId;
            }

            DB::table('reports')->where('report_id', $report)->update($patch);
        });

        $updated = $this->loadReportOr404($report);

        return response()->json([
            'message' => 'COA released to client.',
            'data' => $updated,
        ], 200);
    }
}
