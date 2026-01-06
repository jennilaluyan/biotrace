<?php

namespace App\Http\Controllers;

use App\Models\QcControl;
use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QcControlController extends Controller
{
    /**
     * GET /api/v1/qc-controls
     * Read-only list, paginated, filterable.
     */
    public function index(Request $request): JsonResponse
    {
        // RBAC: minimal harus login staff (mengikuti pattern kamu)
        // Kalau kamu pakai EnsureStaff middleware di routes, authorize di sini tidak wajib.
        // Kita tetap aman: read-only untuk semua role staff.
        $query = QcControl::query()
            ->select([
                'qc_control_id',
                'parameter_id',
                'method_id',
                'control_type',
                'target',
                'tolerance',
                'ruleset',
                'is_active',
                'note',
                'created_at',
                'updated_at',
            ]);

        if ($request->filled('parameter_id')) {
            $query->where('parameter_id', (int) $request->input('parameter_id'));
        }

        if ($request->filled('method_id')) {
            $query->where('method_id', (int) $request->input('method_id'));
        }

        if ($request->filled('control_type')) {
            $query->where('control_type', (string) $request->input('control_type'));
        }

        if ($request->filled('is_active')) {
            $isActive = filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isActive !== null) {
                $query->where('is_active', $isActive);
            }
        }

        $perPage = (int) $request->input('per_page', 25);
        $perPage = max(1, min(100, $perPage)); // hard limit anti memory

        $data = $query
            ->orderBy('qc_control_id')
            ->paginate($perPage);

        return response()->json([
            'status' => 200,
            'message' => 'QC controls retrieved.',
            'data' => $data,
        ], 200);
    }

    /**
     * GET /api/v1/samples/{sample}/qc-controls
     * Controls relevan untuk sample (by parameter_id in sample_tests).
     */
    public function forSample(Request $request, Sample $sample): JsonResponse
    {
        // Ambil parameter_id yang ada di sample_tests, tanpa load besar
        $paramIds = $sample->sampleTests()
            ->select('parameter_id')
            ->distinct()
            ->pluck('parameter_id');

        $query = QcControl::query()
            ->select([
                'qc_control_id',
                'parameter_id',
                'method_id',
                'control_type',
                'target',
                'tolerance',
                'ruleset',
                'is_active',
                'note',
            ])
            ->whereIn('parameter_id', $paramIds);

        // Optional: filter is_active default true
        $onlyActive = $request->input('only_active', '1');
        $onlyActiveBool = filter_var($onlyActive, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($onlyActiveBool !== null && $onlyActiveBool === true) {
            $query->where('is_active', true);
        }

        // Optional: method_id filter
        if ($request->filled('method_id')) {
            $query->where(function ($q) use ($request) {
                $q->whereNull('method_id')
                    ->orWhere('method_id', (int) $request->input('method_id'));
            });
        }

        $data = $query
            ->orderBy('parameter_id')
            ->orderBy('qc_control_id')
            ->get();

        return response()->json([
            'status' => 200,
            'message' => 'QC controls for sample retrieved.',
            'data' => [
                'sample_id' => $sample->getAttribute('sample_id'),
                'qc_controls' => $data,
            ],
        ], 200);
    }
}
