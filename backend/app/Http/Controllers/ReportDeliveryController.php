<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportDeliveryController extends Controller
{
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
        $report = DB::table('reports')
            ->where('report_id', $reportId)
            ->first();

        if (!$report) {
            abort(404, 'Report not found.');
        }

        return $report;
    }

    private function resolveReportSampleIds(int $reportId, object $report): array
    {
        $sampleIds = Schema::hasTable('report_samples')
            ? DB::table('report_samples')
            ->where('report_id', $reportId)
            ->orderBy('batch_item_no')
            ->pluck('sample_id')
            ->map(fn($x) => (int) $x)
            ->all()
            : [(int) ($report->sample_id ?? 0)];

        return array_values(array_filter($sampleIds, fn($x) => $x > 0));
    }

    private function buildReleaseResponse(string $message, int $reportId, object $report, ?string $releasedAt = null): JsonResponse
    {
        $sampleIds = $this->resolveReportSampleIds($reportId, $report);

        return response()->json([
            'message' => $message,
            'data' => [
                'report_id' => $reportId,
                'sample_ids' => $sampleIds,
                'batch_total' => count($sampleIds),
                'released_at' => $releasedAt ?? now()->toIso8601String(),
            ],
        ], 200);
    }

    public function markCoaChecked(Request $request, int $report): JsonResponse
    {
        $this->assertAdminOr403();

        $now = now();
        $staffId = (int) (Auth::user()?->staff_id ?? 0);

        $current = $this->loadReportOr404($report);

        if (!($current->is_locked ?? false)) {
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

    public function releaseCoaToClient(Request $request, int $report): JsonResponse
    {
        $this->assertAdminOr403();

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:4000'],
        ]);

        $now = now();
        $staffId = (int) (Auth::user()?->staff_id ?? 0);

        $current = $this->loadReportOr404($report);

        if (!($current->is_locked ?? false)) {
            return response()->json(['message' => 'Report must be finalized/locked first.'], 409);
        }

        if (!Schema::hasColumn('reports', 'coa_released_to_client_at')) {
            return response()->json(['message' => 'Server missing COA release fields. Run migrations.'], 500);
        }

        if (!empty($current->coa_released_to_client_at)) {
            return $this->buildReleaseResponse(
                'COA already released to client.',
                $report,
                $current,
                (string) $current->coa_released_to_client_at
            );
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

            if (Schema::hasColumn('reports', 'coa_checked_at')) {
                $patch['coa_checked_at'] = $now;
            }

            if (Schema::hasColumn('reports', 'coa_checked_by_staff_id')) {
                $patch['coa_checked_by_staff_id'] = $staffId;
            }

            DB::table('reports')
                ->where('report_id', $report)
                ->update($patch);
        });

        $updated = $this->loadReportOr404($report);

        return $this->buildReleaseResponse(
            'COA released to client.',
            $report,
            $updated,
            $now->toIso8601String()
        );
    }
}
