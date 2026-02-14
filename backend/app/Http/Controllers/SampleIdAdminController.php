<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleIdAssignRequest;
use App\Http\Requests\SampleIdProposeChangeRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Models\SampleIdChangeRequest;
use App\Services\SampleIdService;
use App\Support\AuditLogger;
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

        // ✅ capture old BEFORE service mutates
        $oldLab = $sample->lab_sample_code ?? null;

        try {
            $updated = $this->svc->assignFinal($actor, $sample, $input);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // ✅ determine whether this assignment is based on an approved proposal
        $changeRequestId = null;
        $source = 'direct_assign';

        $norm = function ($v) {
            $s = strtoupper(trim((string) $v));
            $s = preg_replace('/[^A-Z0-9]/', '', $s); // remove spaces/dashes
            return $s ?: '';
        };

        $approved = SampleIdChangeRequest::query()
            ->where('sample_id', (int) $updated->sample_id)
            ->where('status', 'APPROVED')
            ->orderByDesc('change_request_id')
            ->first();

        if ($approved && $norm($approved->proposed_sample_id) !== '' && $norm($updated->lab_sample_code) !== '') {
            if ($norm($approved->proposed_sample_id) === $norm($updated->lab_sample_code)) {
                $changeRequestId = (int) $approved->change_request_id;
                $source = 'approved_proposal';
            }
        }

        // ✅ audit: SAMPLE_ID_ASSIGNED (actor = real admin staff)
        AuditLogger::logSampleIdAssigned(
            staffId: (int) $actor->staff_id,
            sampleId: (int) $updated->sample_id,
            oldLabSampleCode: is_string($oldLab) ? $oldLab : null,
            newLabSampleCode: is_string($updated->lab_sample_code) ? $updated->lab_sample_code : null,
            changeRequestId: $changeRequestId,
            source: $source,
            inputSampleId: is_string($input) ? $input : null
        );

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

        // ✅ audit: SAMPLE_ID_PROPOSED
        AuditLogger::logSampleIdProposed(
            staffId: (int) $actor->staff_id,
            sampleId: (int) $cr->sample_id,
            changeRequestId: (int) $cr->change_request_id,
            suggestedSampleId: is_string($cr->suggested_sample_id) ? $cr->suggested_sample_id : null,
            proposedSampleId: (string) $cr->proposed_sample_id,
            note: is_string($note) ? $note : null
        );

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
