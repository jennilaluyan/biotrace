<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReagentCalcApproveRequest;
use App\Http\Requests\ReagentCalcUpdateRequest;
use App\Models\AuditLog;
use App\Models\ReagentCalculation;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Models\Sample;
use Illuminate\Support\Facades\Schema;


class ReagentCalculationController extends Controller
{
    /**
     * GET /api/v1/reagent-calcs?sample_id=10
     * List reagent calcs (minimal buat debug/UI)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'reagent_calculations']);
        }

        // roles allowed read
        $role = optional($user->role)->name;
        if (!in_array($role, ['Admin', 'Officer Manager', 'Lab Head', 'Analyst', 'Operator'], true)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'reagent_calculations']);
        }

        $q = ReagentCalculation::query()->orderByDesc('updated_at')->orderByDesc('calc_id');

        if ($request->filled('sample_id')) {
            $q->where('sample_id', (int) $request->query('sample_id'));
        }

        $items = $q->limit(50)->get();

        return ApiResponse::success(
            ['items' => $items],
            'Reagent calculations fetched.',
            200,
            ['resource' => 'reagent_calculations']
        );
    }

    /**
     * GET /api/v1/reagent-calcs/{reagentCalculation}
     */
    public function show(Request $request, ReagentCalculation $reagentCalculation): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'reagent_calculations']);
        }

        $role = optional($user->role)->name;
        if (!in_array($role, ['Admin', 'Officer Manager', 'Lab Head', 'Analyst', 'Operator'], true)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'reagent_calculations']);
        }

        return ApiResponse::success(
            ['calc' => $reagentCalculation],
            'Reagent calculation fetched.',
            200,
            ['resource' => 'reagent_calculations']
        );
    }

    /**
     * PATCH /api/v1/reagent-calcs/{reagentCalculation}
     * Analyst propose edit (pending approval)
     *
     * Behavior:
     * - only Analyst/Operator can propose
     * - set edited_by/edited_at
     * - bump version_no
     * - store proposal into payload.proposal
     * - keep locked=false (artinya masih pending / belum final)
     */
    public function update(ReagentCalcUpdateRequest $request, ReagentCalculation $reagentCalculation): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'reagent_calculations']);
        }

        $role = optional($user->role)->name;
        if (!in_array($role, ['Analyst', 'Operator'], true)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'reagent_calculations']);
        }

        $actorId = $user->{$user->getKeyName()} ?? $user->staff_id ?? null;
        if (!$actorId) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'reagent_calculations']);
        }

        // ✅ Gate Step 2.3: crosscheck must PASS before reagent proposal/edit
        $block = $this->guardCrosscheckPassedForReagentBySampleId((int) $reagentCalculation->sample_id);
        if ($block) {
            $this->writeAudit(
                $request,
                $user,
                'reagent_calculation',
                (int) $reagentCalculation->calc_id,
                'REAGENT_EDIT_BLOCKED',
                null,
                [
                    'reason' => 'crosscheck_required',
                    'sample_id' => (int) $reagentCalculation->sample_id,
                ]
            );

            return $block;
        }

        // kalau sudah locked=true dan sudah ada om_approved_by -> jangan boleh diedit langsung
        if ($reagentCalculation->locked === true && !empty($reagentCalculation->om_approved_by)) {
            $this->writeAudit(
                $request,
                $user,
                'reagent_calculation',
                (int) $reagentCalculation->calc_id,
                'REAGENT_EDIT_BLOCKED',
                null,
                ['reason' => 'locked_and_approved']
            );

            return ApiResponse::error(
                'Reagent calculation is locked (already approved).',
                'CONFLICT',
                409,
                ['resource' => 'reagent_calculations']
            );
        }

        $data = $request->validated();

        $old = [
            'calc_id'       => $reagentCalculation->calc_id,
            'sample_id'     => $reagentCalculation->sample_id,
            'locked'        => $reagentCalculation->locked,
            'version_no'    => $reagentCalculation->version_no,
            'edited_by'     => $reagentCalculation->edited_by,
            'edited_at'     => optional($reagentCalculation->edited_at)?->toIso8601String(),
            'payload'       => $reagentCalculation->payload,
        ];

        $payload = is_array($reagentCalculation->payload) ? $reagentCalculation->payload : [];

        // Simpan proposal terpisah, jangan overwrite baseline
        $payload['proposal'] = [
            'data'       => $data['payload'],
            'notes'      => $data['notes'] ?? null,
            'actor_id'   => (int) $actorId,
            'actor_role' => $role,
            'proposed_at' => now()->toIso8601String(),
        ];
        $payload['last_event'] = [
            'type' => 'proposed',
            'at'   => now()->toIso8601String(),
        ];

        $reagentCalculation->payload     = $payload;
        $reagentCalculation->edited_by   = (int) $actorId;
        $reagentCalculation->edited_at   = now();
        $reagentCalculation->updated_at  = now();
        $reagentCalculation->notes       = $data['notes'] ?? $reagentCalculation->notes;

        $reagentCalculation->version_no  = (int) ($reagentCalculation->version_no ?? 1) + 1;

        // pending approval -> pastikan locked = false
        $reagentCalculation->locked = false;

        $reagentCalculation->save();

        $new = [
            'calc_id'       => $reagentCalculation->calc_id,
            'sample_id'     => $reagentCalculation->sample_id,
            'locked'        => $reagentCalculation->locked,
            'version_no'    => $reagentCalculation->version_no,
            'edited_by'     => $reagentCalculation->edited_by,
            'edited_at'     => optional($reagentCalculation->edited_at)?->toIso8601String(),
            'payload'       => $reagentCalculation->payload,
        ];

        $this->writeAudit(
            $request,
            $user,
            'reagent_calculation',
            (int) $reagentCalculation->calc_id,
            'REAGENT_EDIT_PROPOSED',
            $old,
            $new
        );

        return ApiResponse::success(
            ['calc' => $reagentCalculation],
            'Reagent change proposed (pending approval).',
            202,
            ['resource' => 'reagent_calculations']
        );
    }

    /**
     * POST /api/v1/reagent-calcs/{reagentCalculation}/approve
     * OM approve/reject proposal
     *
     * approve=true:
     * - move payload.proposal.data => payload.effective (atau payload.baseline jika kamu mau)
     * - set om_approved_by, om_approved_at
     * - locked=true
     *
     * approve=false:
     * - remove payload.proposal
     * - locked tetap false (atau true kalau kamu mau “close”)
     */
    public function approve(ReagentCalcApproveRequest $request, ReagentCalculation $reagentCalculation): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'reagent_calculations']);
        }

        $role = optional($user->role)->name;
        if (!in_array($role, ['Officer Manager', 'Admin'], true)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'reagent_calculations']);
        }

        $actorId = $user->{$user->getKeyName()} ?? $user->staff_id ?? null;
        if (!$actorId) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'reagent_calculations']);
        }

        $data = $request->validated();
        $approved = (bool) $data['approved'];

        $payload = is_array($reagentCalculation->payload) ? $reagentCalculation->payload : [];
        $proposal = $payload['proposal']['data'] ?? null;

        if (!$proposal) {
            return ApiResponse::error(
                'No pending proposal found for this reagent calculation.',
                'UNPROCESSABLE_ENTITY',
                422,
                ['resource' => 'reagent_calculations']
            );
        }

        $old = [
            'locked'        => $reagentCalculation->locked,
            'om_approved_by' => $reagentCalculation->om_approved_by,
            'om_approved_at' => optional($reagentCalculation->om_approved_at)?->toIso8601String(),
            'payload'       => $reagentCalculation->payload,
        ];

        if ($approved) {
            // Apply proposal
            $payload['effective'] = [
                'data'        => $proposal,
                'approved_by' => (int) $actorId,
                'approved_at' => now()->toIso8601String(),
                'notes'       => $data['notes'] ?? null,
            ];
            unset($payload['proposal']);

            $payload['last_event'] = [
                'type' => 'approved',
                'at'   => now()->toIso8601String(),
            ];

            $reagentCalculation->om_approved_by = (int) $actorId;
            $reagentCalculation->om_approved_at = now();
            $reagentCalculation->locked         = true;
        } else {
            // Reject proposal
            unset($payload['proposal']);

            $payload['last_event'] = [
                'type' => 'rejected',
                'at'   => now()->toIso8601String(),
            ];

            // tetap pending-open (boleh propose ulang)
            $reagentCalculation->locked = false;
        }

        $reagentCalculation->payload    = $payload;
        $reagentCalculation->updated_at = now();
        $reagentCalculation->notes      = $data['notes'] ?? $reagentCalculation->notes;
        $reagentCalculation->version_no = (int) ($reagentCalculation->version_no ?? 1) + 1;

        $reagentCalculation->save();

        $new = [
            'locked'        => $reagentCalculation->locked,
            'om_approved_by' => $reagentCalculation->om_approved_by,
            'om_approved_at' => optional($reagentCalculation->om_approved_at)?->toIso8601String(),
            'payload'       => $reagentCalculation->payload,
        ];

        $this->writeAudit(
            $request,
            $user,
            'reagent_calculation',
            (int) $reagentCalculation->calc_id,
            $approved ? 'REAGENT_EDIT_APPROVED' : 'REAGENT_EDIT_REJECTED',
            $old,
            $new
        );

        return ApiResponse::success(
            ['calc' => $reagentCalculation],
            $approved ? 'Reagent change approved.' : 'Reagent change rejected.',
            200,
            ['resource' => 'reagent_calculations']
        );
    }

    private function writeAudit(
        Request $request,
        $user,
        string $entityName,
        ?int $entityId,
        string $action,
        $oldValues = null,
        $newValues = null
    ): void {
        try {
            AuditLog::create([
                'staff_id'    => $user?->staff_id ?? null,
                'entity_name' => $entityName,
                'entity_id'   => $entityId,
                'action'      => $action,
                'timestamp'   => now(),
                'ip_address'  => $request->ip(),
                'old_values'  => $oldValues,
                'new_values'  => $newValues,
            ]);
        } catch (\Throwable $e) {
            Log::warning('AuditLog write failed: ' . $e->getMessage());
        }
    }

    private function guardCrosscheckPassedForReagentBySampleId(int $sampleId): ?JsonResponse
    {
        // Crosscheck fields must exist (from step 2.1)
        if (!Schema::hasColumn('samples', 'crosscheck_status')) {
            return \App\Support\ApiResponse::error(
                'Crosscheck belum tersedia (migrasi crosscheck belum dijalankan).',
                'CROSSCHECK_NOT_SUPPORTED',
                409
            );
        }

        $groupCandidates = [
            'loa_generated_at',
            'lo_id',
            'loo_id',
            'letter_of_order_id',
            'request_id',
            'sample_request_id',
        ];

        // Only select columns that actually exist (avoid SQL error)
        $selectCols = ['sample_id', 'crosscheck_status', 'lab_sample_code'];
        foreach ($groupCandidates as $col) {
            if (Schema::hasColumn('samples', $col)) {
                $selectCols[] = $col;
            }
        }

        $anchor = Sample::query()
            ->select(array_values(array_unique($selectCols)))
            ->find($sampleId);

        if (!$anchor) {
            return \App\Support\ApiResponse::error(
                'Sample not found.',
                'SAMPLE_NOT_FOUND',
                404
            );
        }

        // Default: only this sample
        $q = Sample::query()
            ->select(['sample_id', 'crosscheck_status', 'lab_sample_code'])
            ->where('sample_id', $anchor->sample_id);

        // Best-effort “request grouping”
        foreach ($groupCandidates as $col) {
            if (Schema::hasColumn('samples', $col)) {
                $val = $anchor->{$col} ?? null;

                // allow grouping even if val is 0-like? (keep strict non-empty)
                if ($val !== null && $val !== '') {
                    $q = Sample::query()
                        ->select(['sample_id', 'crosscheck_status', 'lab_sample_code'])
                        ->where($col, $val);
                    break;
                }
            }
        }

        $rows = $q->get();

        $notPassed = $rows->filter(function ($r) {
            return strtolower((string)($r->crosscheck_status ?? 'pending')) !== 'passed';
        })->values();

        if ($notPassed->isNotEmpty()) {
            return \App\Support\ApiResponse::error(
                'Reagent Request diblokir: crosscheck harus PASS untuk semua sample dalam request.',
                'CROSSCHECK_REQUIRED',
                409,
                [
                    'blocked_samples' => $notPassed->map(fn($r) => [
                        'sample_id' => $r->sample_id,
                        'lab_sample_code' => $r->lab_sample_code,
                        'crosscheck_status' => $r->crosscheck_status ?? 'pending',
                    ])->all(),
                ]
            );
        }

        return null;
    }
}