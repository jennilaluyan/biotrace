<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Services\ReportGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ReportController extends Controller
{
    /**
     * POST /api/v1/samples/{id}/reports
     * Generate report for sample (MVP infra).
     */
    public function store(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $actorStaffId = (int) ($user->staff_id ?? 0);
        if ($actorStaffId <= 0) {
            return response()->json(['message' => 'Invalid actor staff id.'], 422);
        }

        // If already exists, return it (idempotent behavior)
        $existing = Report::query()->where('sample_id', $id)->first();
        if ($existing) {
            return response()->json([
                'message' => 'Report already exists for this sample.',
                'data' => $this->buildReportPayload((int) $existing->report_id),
            ], 200);
        }

        try {
            $svc = app(ReportGenerationService::class);
            $report = $svc->generateForSample($id, $actorStaffId);

            return response()->json([
                'message' => 'Report generated.',
                'data' => $this->buildReportPayload((int) $report->report_id),
            ], 201);
        } catch (RuntimeException $e) {
            // Service throws RuntimeException for business rules
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * GET /api/v1/reports/{id}
     * Show report metadata + items + signatures.
     */
    public function show(int $id): JsonResponse
    {
        $report = Report::query()->where('report_id', $id)->first();
        if (!$report) {
            return response()->json(['message' => 'Report not found.'], 404);
        }

        return response()->json([
            'message' => 'OK',
            'data' => $this->buildReportPayload($id),
        ], 200);
    }

    /**
     * Build full report payload without depending on Eloquent relations
     * (safe even if relations are not defined yet).
     */
    private function buildReportPayload(int $reportId): array
    {
        $report = DB::table('reports')->where('report_id', $reportId)->first();

        $items = DB::table('report_items')
            ->where('report_id', $reportId)
            ->orderBy('order_no')
            ->get()
            ->values();

        $allowedCodes = \App\Models\ReportSignatureRole::query()->pluck('role_code')->all();

        $signatures = \App\Models\ReportSignature::query()
            ->where('report_id', $reportId)
            ->when(!empty($allowedCodes), fn($q) => $q->whereIn('role_code', $allowedCodes))
            ->orderBy('role_code')
            ->get();

        return [
            'report' => $report,
            'items' => $items,
            'signatures' => $signatures,
        ];
    }
}
