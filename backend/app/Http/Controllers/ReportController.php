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
     * GET /api/v1/reports
     * List reports (QA / Lab Head).
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // QA (Operational Manager) or Lab Head only
        if (!in_array((int) ($user->role_id ?? 0), [5, 6])) {
            // 5 = OM / QA, 6 = Lab Head
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $perPage = max(1, (int) $request->query('per_page', 10));
        $q = trim((string) $request->query('q', ''));
        $date = $request->query('date');

        /**
         * BASE QUERY
         * - join samples + clients agar search client_name WORK
         * - select minimal fields (performance-safe)
         */
        $query = DB::table('reports')
            ->join('samples', 'samples.sample_id', '=', 'reports.sample_id')
            ->join('clients', 'clients.client_id', '=', 'samples.client_id')
            ->select(
                'reports.report_id',
                'reports.report_no',
                'reports.sample_id',
                'clients.name as client_name',
                'reports.generated_at',
                'reports.is_locked'
            )
            ->orderByDesc('reports.generated_at');

        /**
         * SEARCH FILTER
         * q → report_no OR client_name OR sample_id
         */
        if ($q !== '') {
            $qLower = mb_strtolower($q);

            $query->where(function ($sub) use ($qLower) {
                $sub->whereRaw('LOWER(reports.report_no) LIKE ?', ["%{$qLower}%"])
                    ->orWhereRaw('LOWER(clients.name) LIKE ?', ["%{$qLower}%"])
                    ->orWhereRaw('CAST(reports.sample_id AS CHAR) LIKE ?', ["%{$qLower}%"]);
            });
        }

        /**
         * DATE FILTER
         */
        if ($date) {
            match ($date) {
                'today' => $query->whereDate('reports.generated_at', now()),
                '7d'    => $query->where('reports.generated_at', '>=', now()->subDays(7)),
                '30d'   => $query->where('reports.generated_at', '>=', now()->subDays(30)),
                default => null,
            };
        }

        /**
         * PAGINATION
         */
        $reports = $query->paginate($perPage);

        /**
         * RESPONSE FORMAT — TETAP SAMA (LOCKED)
         */
        return response()->json([
            'current_page' => $reports->currentPage(),
            'data'         => $reports->items(),
            'per_page'     => $reports->perPage(),
            'total'        => $reports->total(),
            'last_page'    => $reports->lastPage(),
        ], 200);
    }

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
     * POST /api/v1/reports/{id}/finalize
     * Finalize & lock report (Lab Head only).
     */
    public function finalize(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // LH only (role_id = 6)
        if ((int) ($user->role_id ?? 0) !== 6) {
            return response()->json(['message' => 'Forbidden. Lab Head only.'], 403);
        }

        $report = Report::query()->where('report_id', $id)->first();
        if (!$report) {
            return response()->json(['message' => 'Report not found.'], 404);
        }

        if ($report->is_locked) {
            return response()->json([
                'message' => 'Report already finalized.',
            ], 409);
        }

        $signature = \App\Models\ReportSignature::query()
            ->where('report_id', $id)
            ->where('role_code', 'LH')
            ->first();

        if (!$signature) {
            return response()->json([
                'message' => 'LH signature slot not found.',
            ], 409);
        }

        DB::transaction(function () use ($report, $signature, $user) {
            $now = now();

            // Build canonical payload
            $payload = $this->buildSignaturePayload(
                $report->report_id,
                $user->staff_id,
                $now->toISOString()
            );

            // Deterministic SHA-256
            $hash = hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE));

            // Sign as LH
            $signature->signed_by = $user->staff_id;
            $signature->signed_at = $now;
            $signature->signature_hash = $hash;
            $signature->save();

            // Lock report
            $report->is_locked = true;
            $report->updated_at = $now;
            $report->save();
        });

        return response()->json([
            'message' => 'Report finalized and locked.',
            'report_id' => $report->report_id,
            'locked' => true,
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

    /**
     * Build canonical payload for digital signature hashing.
     */
    private function buildSignaturePayload(int $reportId, int $signedBy, string $signedAt): array
    {
        $report = DB::table('reports')
            ->where('report_id', $reportId)
            ->first();

        $items = DB::table('report_items')
            ->where('report_id', $reportId)
            ->orderBy('order_no')
            ->get()
            ->map(fn($i) => [
                'parameter' => $i->parameter_name,
                'method' => $i->method_name,
                'value' => $i->result_value,
                'unit' => $i->unit_label,
                'flags' => $i->flags,
                'interpretation' => $i->interpretation,
            ])
            ->values()
            ->all();

        return [
            'report_id' => $report->report_id,
            'report_no' => $report->report_no,
            'sample_id' => $report->sample_id,
            'generated_at' => (string) $report->generated_at,
            'items' => $items,
            'signed_by' => $signedBy,
            'signed_at' => $signedAt,
        ];
    }
}
