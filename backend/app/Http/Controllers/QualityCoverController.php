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

    private function assertOperationalManager(Staff $staff): void
    {
        // Role name source of truth mengikuti SamplePolicy: "Operational Manager"
        $roleName = (string) optional($staff->role)->name;
        if ($roleName !== 'Operational Manager') {
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

        // Find existing draft
        $cover = QualityCover::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->where('status', 'draft')
            ->orderByDesc('quality_cover_id')
            ->first();

        if (!$cover) {
            // If already submitted before, block double submit (optional)
            $latest = QualityCover::query()
                ->where('sample_id', (int) $sample->sample_id)
                ->orderByDesc('quality_cover_id')
                ->first();

            if ($latest && $latest->status === 'submitted') {
                return response()->json([
                    'message' => 'Quality cover already submitted.',
                    'data' => $latest,
                ], 409);
            }

            $cover = new QualityCover();
            $cover->sample_id = (int) $sample->sample_id;
            $cover->status = 'draft';
            $cover->date_of_analysis = Carbon::now()->toDateString();
            $cover->checked_by_staff_id = (int) $staff->staff_id;
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

        AuditLogger::logQualityCoverSubmitted(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $sample->sample_id,
            qualityCoverId: (int) $cover->quality_cover_id,
            workflowGroup: (string) $group,
            methodOfAnalysis: (string) ($cover->method_of_analysis ?? null),
        );

        return response()->json([
            'message' => 'Quality cover submitted.',
            'data' => $cover,
        ]);
    }

    /**
     * GET /v1/quality-covers/inbox/om
     * Inbox OM: list covers that are ready to be verified (submitted).
     *
     * Query params:
     * - search: string (optional) -> matches sample.lab_sample_code OR sample.client.name
     * - per_page: int (optional, default 25, max 100)
     * - page: int (optional)
     */
    public function inboxOm(\Illuminate\Http\Request $request): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertOperationalManager($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        $perPage = max(1, min(100, $perPage));

        // Inbox OM = submitted
        $q = QualityCover::query()
            ->with([
                'sample' => function ($s) {
                    $s->select(['sample_id', 'client_id', 'lab_sample_code', 'workflow_group']);
                    $s->with(['client:client_id,name']);
                },
                'checkedBy:staff_id,name',
            ])
            ->where('status', 'submitted')
            ->orderByDesc('submitted_at')
            ->orderByDesc('quality_cover_id');

        if ($search !== '') {
            $q->where(function ($qq) use ($search) {
                $qq->whereHas('sample', function ($s) use ($search) {
                    $s->where('lab_sample_code', 'like', "%{$search}%")
                        ->orWhereHas('client', function ($c) use ($search) {
                            $c->where('name', 'like', "%{$search}%");
                        });
                });
            });
        }

        $page = $q->paginate($perPage);

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
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

        AuditLogger::logQualityCoverSaved(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $sample->sample_id,
            qualityCoverId: (int) $cover->quality_cover_id,
            status: (string) $cover->status,
            workflowGroup: (string) ($sample->workflow_group ?? null),
            methodOfAnalysis: (string) ($cover->method_of_analysis ?? null),
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
