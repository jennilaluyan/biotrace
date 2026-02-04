<?php

namespace App\Http\Controllers;

use App\Http\Requests\QualityCoverDraftSaveRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Models\QualityCover;
use App\Support\AuditLogger;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use App\Http\Requests\QualityCoverSubmitRequest;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Schema;

class QualityCoverController extends Controller
{
    private function assertAnalyst(Staff $staff): void
    {
        $roleName = strtolower((string) optional($staff->role)->name);
        if ($roleName !== 'analyst') {
            abort(403, 'Forbidden.');
        }
    }

    /**
     * GET /v1/samples/{sample}/quality-cover
     * Return existing draft (or latest cover) for the sample.
     */
    public function show(Sample $sample): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertAnalyst($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        $cover = QualityCover::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->orderByDesc('quality_cover_id')
            ->first();

        return response()->json([
            'data' => $cover,
        ]);
    }

    public function submit(QualityCoverSubmitRequest $request, Sample $sample): JsonResponse
    {
        $payload = $request->validated();

        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertAnalyst($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        $cover = QualityCover::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->where('status', 'draft')
            ->orderByDesc('quality_cover_id')
            ->first();

        if (!$cover) {
            return response()->json(['message' => 'Draft quality cover not found.'], 404);
        }

        // Determine workflow group (from To-Do 9)
        $group = (string) ($sample->workflow_group ?? 'others');
        $group = strtolower(trim($group)) ?: 'others';

        // Group-aware validation (submit is strict)
        $this->validateQcPayloadByGroup($payload['qc_payload'], $group);

        // Lock fields at submit time
        $cover->workflow_group = $group;
        $cover->method_of_analysis = $payload['method_of_analysis'];
        $cover->qc_payload = $payload['qc_payload'];

        $cover->status = 'submitted';
        $cover->submitted_at = now();

        $cover->save();

        // audit
        AuditLogger::logQualityCoverSubmitted(
            $staff->staff_id,
            (int) $sample->sample_id,
            (int) $cover->quality_cover_id,
            (string) $group
        );

        return response()->json([
            'message' => 'Quality cover submitted.',
            'data' => $cover,
        ]);
    }

    /**
     * PUT /v1/samples/{sample}/quality-cover/draft
     * Upsert draft for a sample.
     */
    public function saveDraft(QualityCoverDraftSaveRequest $request, Sample $sample): JsonResponse
    {
        $payload = $request->validated();

        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertAnalyst($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        // Draft is per-sample: 1 active draft record (update or create)
        $cover = QualityCover::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->where('status', 'draft')
            ->orderByDesc('quality_cover_id')
            ->first();

        $today = Carbon::now()->toDateString();

        if (!$cover) {
            $cover = new QualityCover();
            $cover->sample_id = (int) $sample->sample_id;
            $cover->status = 'draft';
        }

        // locked-ish fields are still set server-side for integrity
        $cover->date_of_analysis = $today;
        $cover->checked_by_staff_id = (int) $staff->staff_id;

        // editable fields
        if (array_key_exists('method_of_analysis', $payload)) {
            $cover->method_of_analysis = $payload['method_of_analysis'];
        }
        if (array_key_exists('qc_payload', $payload)) {
            $cover->qc_payload = $payload['qc_payload'];
        }

        $cover->save();

        // audit-first (draft save)
        AuditLogger::logQualityCoverSaved(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $sample->sample_id,
            qualityCoverId: (int) $cover->quality_cover_id,
            status: (string) $cover->status,
        );

        return response()->json([
            'message' => 'Draft saved.',
            'data' => $cover,
        ]);
    }

    private function validateQcPayloadByGroup(array $qc, string $group): void
    {
        // Normalize group naming to your project reality:
        // - "pcr" or "pcr_sars_cov_2"
        // - "wgs" or "wgs_sars_cov_2"
        $isPcr = str_contains($group, 'pcr');
        $isWgs = str_contains($group, 'wgs');

        if ($isPcr) {
            $rules = [
                'ORF1b.value' => ['required', 'numeric'],
                'ORF1b.result' => ['required', 'string', 'max:255'],
                'ORF1b.interpretation' => ['required', 'string', 'max:255'],

                'RdRp.value' => ['required', 'numeric'],
                'RdRp.result' => ['required', 'string', 'max:255'],
                'RdRp.interpretation' => ['required', 'string', 'max:255'],

                'RPP30.value' => ['required', 'numeric'],
                'RPP30.result' => ['required', 'string', 'max:255'],
                'RPP30.interpretation' => ['required', 'string', 'max:255'],
            ];
        } elseif ($isWgs) {
            $rules = [
                'lineage' => ['required', 'string', 'max:255'],
                'variant' => ['required', 'string', 'max:255'],
            ];
        } else {
            $rules = [
                'notes' => ['required', 'string'],
            ];
        }

        $v = Validator::make($qc, $rules);
        if ($v->fails()) {
            abort(response()->json([
                'message' => 'Invalid qc_payload for workflow group.',
                'errors' => $v->errors(),
            ], 422));
        }
    }
}
