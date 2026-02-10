<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use App\Services\SampleArchiveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SampleArchiveController extends Controller
{
    public function __construct(private readonly SampleArchiveService $svc) {}

    /**
     * GET /v1/samples/archive
     * Query:
     * - q?: string (search lab code / client name / report no)
     * - per_page?: int (default 15)
     */
    public function index(Request $request): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        // ✅ Only Admin/OM/LH
        $this->authorize('viewArchiveIndex', Sample::class);

        $perPage = (int) $request->query('per_page', 15);
        if ($perPage < 1) $perPage = 15;
        if ($perPage > 100) $perPage = 100;

        $q = trim((string) $request->query('q', ''));

        $result = $this->svc->paginate([
            'q' => $q,
            'per_page' => $perPage,
        ]);

        return response()->json($result);
    }

    /**
     * GET /v1/samples/archive/{sampleId}
     */
    public function show(Request $request, int $sampleId): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $sample = Sample::query()->with('client')->findOrFail($sampleId);

        // ✅ Only Admin/OM/LH AND must be completed/reported
        $this->authorize('viewArchiveDetail', $sample);

        $data = $this->svc->detail($sample);

        return response()->json(['data' => $data]);
    }
}
