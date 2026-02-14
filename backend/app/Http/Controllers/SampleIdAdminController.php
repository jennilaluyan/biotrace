<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleIdAssignRequest;
use App\Http\Requests\SampleIdProposeChangeRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Services\SampleIdService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SampleIdAdminController extends Controller
{
    public function __construct(private readonly SampleIdService $svc) {}

    private function assertAdminOr403(): void
    {
        $user = Auth::user();
        $roleName = strtolower((string) ($user?->role?->name ?? $user?->role_name ?? ''));
        $roleId = (int) ($user?->role_id ?? 0);

        $isAdmin =
            $roleId === 2 ||
            str_contains($roleName, 'administrator') ||
            $roleName === 'admin' ||
            $roleName === 'administrator demo' ||
            $roleName === 'system role';

        if (!$isAdmin) {
            abort(403, 'Forbidden.');
        }
    }

    private function resolveSampleIdPrefix(?string $workflowGroup): ?string
    {
        $g = strtolower(trim((string) $workflowGroup));
        if ($g === '') return null;

        $g = str_replace([' ', '-'], '_', $g);
        $g = preg_replace('/_+/', '_', $g);

        if ($g === 'pcr_sars_cov_2') return 'USR';
        if ($g === 'wgs_sars_cov_2') return 'WGS';
        if ($g === 'group_19_22' || $g === 'group_23_32') return 'BML';
        if (str_contains($g, 'antigen')) return 'LBMA';

        return null;
    }

    private function fallbackSuggestionFromCounter(string $prefix): string
    {
        $row = DB::table('sample_id_counters')->where('prefix', $prefix)->first();
        $last = (int) ($row->last_number ?? 0);
        $next = $last + 1;
        $tail = str_pad((string) $next, 3, '0', STR_PAD_LEFT);

        return "{$prefix} {$tail}";
    }

    public function suggestion(Sample $sample): JsonResponse
    {
        $this->assertAdminOr403();

        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // ✅ NEW: ensure prefix exists (helps old samples too)
        if (empty($sample->sample_id_prefix)) {
            $prefix = $this->resolveSampleIdPrefix($sample->workflow_group);
            if ($prefix) {
                $sample->sample_id_prefix = $prefix;
                $sample->save();
            }
        }

        $payload = $this->svc->buildSuggestionPayload($sample);

        // ✅ NEW: hard fallback if service returns empty
        if (empty($payload['suggested_sample_id']) && !empty($sample->sample_id_prefix)) {
            $fallback = $this->fallbackSuggestionFromCounter((string) $sample->sample_id_prefix);
            $payload['suggested_sample_id'] = $fallback;
            $payload['suggested_lab_sample_code'] = $payload['suggested_lab_sample_code'] ?? $fallback;
        }

        if (!empty($payload['suggested_sample_id'])) {
            $this->svc->auditSuggestion($actor, $sample, (string) $payload['suggested_sample_id']);
        }

        return response()->json(['data' => $payload], 200);
    }

    public function assign(SampleIdAssignRequest $request, Sample $sample): JsonResponse
    {
        $this->assertAdminOr403();

        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $input = $request->validated()['sample_id'] ?? null;

        try {
            $updated = $this->svc->assignFinal($actor, $sample, $input);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'sample_id' => (int) $updated->sample_id,
                'lab_sample_code' => $updated->lab_sample_code,
                'request_status' => $updated->request_status,
                'sample_id_assigned_at' => $updated->sample_id_assigned_at,
                'sample_id_assigned_by_staff_id' => $updated->sample_id_assigned_by_staff_id,
            ],
        ], 200);
    }

    public function proposeChange(SampleIdProposeChangeRequest $request, Sample $sample): JsonResponse
    {
        $this->assertAdminOr403();

        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $proposed = (string) $request->validated()['proposed_sample_id'];
        $note = $request->validated()['note'] ?? null;

        try {
            $cr = $this->svc->proposeChange($actor, $sample, $proposed, is_string($note) ? $note : null);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'change_request_id' => (int) $cr->change_request_id,
                'sample_id' => (int) $cr->sample_id,
                'status' => $cr->status,
                'suggested_sample_id' => $cr->suggested_sample_id,
                'proposed_sample_id' => $cr->proposed_sample_id,
                'requested_by_staff_id' => (int) $cr->requested_by_staff_id,
                'created_at' => $cr->created_at,
            ],
        ], 200);
    }
}
