<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use App\Services\SampleArchiveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

class SampleArchiveController extends Controller
{
    public function __construct(private readonly SampleArchiveService $svc) {}

    private function assertStaffRoleAllowed(Staff $staff, array $allowedRoleNames): void
    {
        $roleName = (string) ($staff->role?->name ?? '');

        if (!in_array($roleName, $allowedRoleNames, true)) {
            abort(403, 'Forbidden.');
        }
    }

    private function requireArchiveAccess(): Staff
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            abort(500, 'Authenticated staff not found.');
        }

        // ✅ Only Admin / OM / LH (pakai role name agar tidak tergantung role_id)
        $this->assertStaffRoleAllowed($staff, [
            'Administrator',
            'Operational Manager',
            'Laboratory Head',
        ]);

        return $staff;
    }

    /**
     * GET /v1/sample-archive
     * Query:
     * - q?: string (search lab code / client name / coa/report no)
     * - per_page?: int (default 15)
     * - page?: int (default 1)
     */
    public function index(Request $request): JsonResponse
    {
        $this->requireArchiveAccess();

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
     * GET /v1/sample-archive/{sampleId}
     */
    public function show(Request $request, int $sampleId): JsonResponse
    {
        $this->requireArchiveAccess();

        $sample = Sample::query()
            ->with(['client', 'requestedParameters'])
            ->findOrFail($sampleId);

        // ✅ Only archived/reported sample can be viewed here
        if (Schema::hasColumn('samples', 'current_status')) {
            if ((string) ($sample->current_status ?? '') !== 'reported') {
                abort(404, 'Not found.');
            }
        }

        $data = $this->svc->detail($sample);

        return response()->json(['data' => $data]);
    }
}
