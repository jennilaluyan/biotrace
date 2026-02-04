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

        $cover = QualityCover::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->orderByDesc('quality_cover_id')
            ->first();

        return response()->json([
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
}
