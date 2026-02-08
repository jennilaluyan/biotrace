<?php

namespace App\Http\Controllers;

use App\Http\Requests\QualityCoverDraftSaveRequest;
use App\Http\Requests\QualityCoverSubmitRequest;
use App\Models\QualityCover;
use App\Models\Sample;
use App\Models\Staff;
use App\Services\CoaAutoGenerateService;
use App\Support\AuditLogger;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class QualityCoverController extends Controller
{
    /**
     * Role IDs used in your project (based on earlier rules):
     * - OM = 5
     * - LH = 6
     * - Admin usually = 1 (if different, still safe because we fallback by name)
     */
    private function roleId(Staff $staff): int
    {
        return (int) ($staff->role_id ?? 0);
    }

    private function roleName(Staff $staff): string
    {
        return strtolower(trim((string) optional($staff->role)->name));
    }

    private function isAnalyst(Staff $staff): bool
    {
        $name = $this->roleName($staff);
        // allow minor variance
        return $name === 'analyst';
    }

    private function isOperationalManager(Staff $staff): bool
    {
        $id = $this->roleId($staff);
        if ($id === 5) return true;

        $name = $this->roleName($staff);
        return in_array($name, ['operational manager', 'operation manager', 'om'], true);
    }

    private function isLabHead(Staff $staff): bool
    {
        $id = $this->roleId($staff);
        if ($id === 6) return true;

        $name = $this->roleName($staff);
        return in_array($name, ['lab head', 'laboratory head', 'lh'], true);
    }

    private function isAdmin(Staff $staff): bool
    {
        $name = $this->roleName($staff);
        return $name === 'admin' || $this->roleId($staff) === 1;
    }

    private function assertAnalyst(Staff $staff): void
    {
        if (!$this->isAnalyst($staff)) abort(403, 'Forbidden.');
    }

    private function assertOperationalManager(Staff $staff): void
    {
        if (!$this->isOperationalManager($staff) && !$this->isAdmin($staff)) abort(403, 'Forbidden.');
    }

    private function assertLabHead(Staff $staff): void
    {
        if (!$this->isLabHead($staff) && !$this->isAdmin($staff)) abort(403, 'Forbidden.');
    }

    private function assertOmOrLh(Staff $staff): void
    {
        if (
            !$this->isOperationalManager($staff) &&
            !$this->isLabHead($staff) &&
            !$this->isAdmin($staff)
        ) {
            abort(403, 'Forbidden.');
        }
    }

    /**
     * POST /v1/quality-covers/{qualityCover}/verify
     * OM verifies a submitted quality cover.
     */
    public function omVerify(Request $request, QualityCover $qualityCover): JsonResponse
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

        if ((string) $qualityCover->status !== 'submitted') {
            return response()->json([
                'message' => 'Only submitted quality covers can be verified.',
                'data' => $qualityCover,
            ], 409);
        }

        $qualityCover->status = 'verified';
        $qualityCover->verified_at = now();
        $qualityCover->verified_by_staff_id = (int) $staff->staff_id;

        // reset reject fields (kalau ada data lama)
        $qualityCover->rejected_at = null;
        $qualityCover->rejected_by_staff_id = null;
        $qualityCover->reject_reason = null;

        $qualityCover->save();

        AuditLogger::logQualityCoverOmVerified(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $qualityCover->sample_id,
            qualityCoverId: (int) $qualityCover->quality_cover_id,
            fromStatus: 'submitted',
            toStatus: 'verified',
        );

        return response()->json([
            'message' => 'Quality cover verified (OM).',
            'data' => $qualityCover,
        ]);
    }

    /**
     * POST /v1/quality-covers/{qualityCover}/reject
     * OM rejects a submitted quality cover (reason required).
     */
    public function omReject(Request $request, QualityCover $qualityCover): JsonResponse
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

        if ((string) $qualityCover->status !== 'submitted') {
            return response()->json([
                'message' => 'Only submitted quality covers can be rejected.',
                'data' => $qualityCover,
            ], 409);
        }

        $v = Validator::make($request->all(), [
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        if ($v->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $v->errors(),
            ], 422);
        }

        $reason = (string) $v->validated()['reason'];

        $qualityCover->status = 'rejected';
        $qualityCover->rejected_at = now();
        $qualityCover->rejected_by_staff_id = (int) $staff->staff_id;
        $qualityCover->reject_reason = $reason;

        // reset verify fields (biar konsisten)
        $qualityCover->verified_at = null;
        $qualityCover->verified_by_staff_id = null;

        $qualityCover->save();

        AuditLogger::logQualityCoverOmRejected(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $qualityCover->sample_id,
            qualityCoverId: (int) $qualityCover->quality_cover_id,
            reason: $reason,
            fromStatus: 'submitted',
            toStatus: 'rejected',
        );

        return response()->json([
            'message' => 'Quality cover rejected (OM).',
            'data' => $qualityCover,
        ]);
    }

    /**
     * GET /v1/samples/{sample}/quality-cover
     * Return latest cover for analyst (draft/submitted/etc).
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

    /**
     * POST /v1/samples/{sample}/quality-cover/submit
     * Analyst submits (creates or updates) cover and locks fields.
     */
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
            // block double submit if latest is already submitted
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
            // ✅ Carbon instance (fix: typed date|null)
            $cover->date_of_analysis = Carbon::today();
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
     */
    public function inboxOm(Request $request): JsonResponse
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
     * GET /v1/quality-covers/inbox/lh
     * Inbox LH: list covers that are ready to be validated (verified by OM).
     */
    public function inboxLh(Request $request): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertLabHead($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        $perPage = max(1, min(100, $perPage));

        $q = QualityCover::query()
            ->with([
                'sample' => function ($s) {
                    $s->select(['sample_id', 'client_id', 'lab_sample_code', 'workflow_group']);
                    $s->with(['client:client_id,name']);
                },
                'checkedBy:staff_id,name',
                'verifiedBy:staff_id,name',
            ])
            ->where('status', 'verified')
            ->orderByDesc('verified_at')
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
     * GET /v1/quality-covers/{qualityCover}
     * Read one quality cover (for OM/LH detail pages).
     *
     * IMPORTANT:
     * If you still get 403 after this, the blocker is very likely route middleware/policy.
     */
    public function showById(Request $request, QualityCover $qualityCover): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertOmOrLh($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        $qualityCover->load([
            'sample' => function ($s) {
                $s->select(['sample_id', 'client_id', 'lab_sample_code', 'workflow_group']);
                $s->with(['client:client_id,name']);
            },
            'checkedBy:staff_id,name',
            'verifiedBy:staff_id,name',
            'validatedBy:staff_id,name',
        ]);

        return response()->json([
            'data' => $qualityCover,
        ]);
    }

    /**
     * POST /v1/quality-covers/{qualityCover}/validate
     * LH validates a verified quality cover (final) + AUTO GENERATE COA PDF.
     */
    public function lhValidate(Request $request, QualityCover $qualityCover): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertLabHead($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        if ((string) $qualityCover->status !== 'verified') {
            return response()->json([
                'message' => 'Only verified quality covers can be validated.',
                'data' => $qualityCover,
            ], 409);
        }

        $sampleId = (int) $qualityCover->sample_id;
        $actorId = (int) $staff->staff_id;

        $coa = DB::transaction(function () use ($qualityCover, $sampleId, $actorId) {

            // 1) validate QC
            $qualityCover->status = 'validated';
            $qualityCover->validated_at = now();
            $qualityCover->validated_by_staff_id = $actorId;

            // clear reject fields just in case
            $qualityCover->rejected_at = null;
            $qualityCover->rejected_by_staff_id = null;
            $qualityCover->reject_reason = null;

            $qualityCover->save();

            // 2) Ensure sample status => validated (ReportGenerationService usually expects this)
            $statusCol = Schema::hasColumn('samples', 'current_status')
                ? 'current_status'
                : 'status';

            DB::table('samples')
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->update([$statusCol => 'validated']);

            // 3) Auto-generate + finalize COA (idempotent)
            return app(CoaAutoGenerateService::class)->run($sampleId, $actorId);
        });

        AuditLogger::logQualityCoverLhValidated(
            staffId: $actorId,
            sampleId: $sampleId,
            qualityCoverId: (int) $qualityCover->quality_cover_id,
            fromStatus: 'verified',
            toStatus: 'validated',
        );

        return response()->json([
            'message' => 'Quality cover validated (LH). CoA generated.',
            'data' => [
                'quality_cover' => $qualityCover,
                'report' => $coa,
            ],
        ]);
    }

    /**
     * POST /v1/quality-covers/{qualityCover}/reject-lh
     * LH rejects a verified quality cover (reason required).
     */
    public function lhReject(Request $request, QualityCover $qualityCover): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertLabHead($staff);

        if (!Schema::hasTable('quality_covers')) {
            return response()->json([
                'message' => 'quality_covers table not found. Run migrations.',
                'hint' => 'php artisan migrate',
            ], 500);
        }

        if ((string) $qualityCover->status !== 'verified') {
            return response()->json([
                'message' => 'Only verified quality covers can be rejected by LH.',
                'data' => $qualityCover,
            ], 409);
        }

        $v = Validator::make($request->all(), [
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        if ($v->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $v->errors(),
            ], 422);
        }

        $reason = (string) $v->validated()['reason'];

        $qualityCover->status = 'rejected';
        $qualityCover->rejected_at = now();
        $qualityCover->rejected_by_staff_id = (int) $staff->staff_id;
        $qualityCover->reject_reason = $reason;

        // clear validated fields (biar konsisten)
        $qualityCover->validated_at = null;
        $qualityCover->validated_by_staff_id = null;

        $qualityCover->save();

        AuditLogger::logQualityCoverLhRejected(
            staffId: (int) $staff->staff_id,
            sampleId: (int) $qualityCover->sample_id,
            qualityCoverId: (int) $qualityCover->quality_cover_id,
            reason: $reason,
            fromStatus: 'verified',
            toStatus: 'rejected',
        );

        return response()->json([
            'message' => 'Quality cover rejected by LH.',
            'data' => $qualityCover,
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

        $cover = QualityCover::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->where('status', 'draft')
            ->orderByDesc('quality_cover_id')
            ->first();

        // ✅ Carbon instance (fix: typed date|null)
        $today = Carbon::today();

        if (!$cover) {
            $cover = new QualityCover();
            $cover->sample_id = (int) $sample->sample_id;
            $cover->status = 'draft';
        }

        $cover->date_of_analysis = $today;
        $cover->checked_by_staff_id = (int) $staff->staff_id;

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
