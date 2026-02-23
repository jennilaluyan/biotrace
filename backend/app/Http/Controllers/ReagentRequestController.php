<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReagentRequestDraftSaveRequest;
use App\Models\Staff;
use App\Services\ReagentRequestDocumentService;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ReagentRequestController extends Controller
{
    public function __construct(private readonly ReagentRequestDocumentService $docs) {}

    /**
     * POST /v1/reagent-requests/draft
     * Body:
     * {
     *   lo_id: number,
     *   items?: [{ catalog_id, qty, unit_text?, note? }],
     *   bookings?: [{ booking_id?, equipment_id, planned_start_at, planned_end_at, note? }]
     * }
     *
     * Behaviour:
     * - Kalau sudah ada draft untuk LOO => update draft (overwrite items, sync bookings)
     * - Kalau belum ada => create draft baru
     * - Kalau sudah submitted/approved => 409 (tidak boleh edit)
     */
    public function saveDraft(ReagentRequestDraftSaveRequest $request): JsonResponse
    {
        $data = $request->validated();

        $loId = (int) $data['lo_id'];
        $items = $data['items'] ?? [];
        $bookings = $data['bookings'] ?? [];

        $staffId = $this->resolveStaffId($request);
        if (!$staffId) {
            return ApiResponse::error('Unauthorized: cannot resolve staff actor', 'unauthorized', 401);
        }

        $result = DB::transaction(function () use ($loId, $staffId, $items, $bookings) {
            $created = false;

            // 1) Ambil draft terakhir untuk LOO (kalau ada)
            $existing = DB::table('reagent_requests')
                ->where('lo_id', $loId)
                ->orderByDesc('reagent_request_id')
                ->first();

            if ($existing && in_array($existing->status, ['submitted', 'approved'], true)) {
                abort(409, 'Reagent request already submitted/approved. Create a new revision after rejection.');
            }

            // Old snapshot for audit (best-effort)
            $oldValues = null;
            if ($existing) {
                $oldItemsCount = (int) DB::table('reagent_request_items')
                    ->where('reagent_request_id', (int) $existing->reagent_request_id)
                    ->count();

                $oldBookingsCount = (int) DB::table('equipment_bookings')
                    ->where('reagent_request_id', (int) $existing->reagent_request_id)
                    ->count();

                $oldValues = [
                    'reagent_request_id' => (int) $existing->reagent_request_id,
                    'lo_id' => (int) $existing->lo_id,
                    'status' => (string) $existing->status,
                    'cycle_no' => (int) ($existing->cycle_no ?? 1),
                    'items_count' => $oldItemsCount,
                    'bookings_count' => $oldBookingsCount,
                ];
            }

            // 2) Create/update request row
            if (!$existing || !in_array($existing->status, ['draft', 'rejected'], true)) {
                $created = true;

                $requestId = DB::table('reagent_requests')->insertGetId([
                    'lo_id' => $loId,
                    'created_by_staff_id' => $staffId,
                    'status' => 'draft',
                    'created_at' => now(),
                    'updated_at' => now(),
                ], 'reagent_request_id');
            } else {
                $requestId = (int) $existing->reagent_request_id;

                // Kalau status rejected, kita “re-open” jadi draft (simple revision strategy)
                DB::table('reagent_requests')
                    ->where('reagent_request_id', $requestId)
                    ->update([
                        'status' => 'draft',
                        'updated_at' => now(),
                    ]);
            }

            // 3) Overwrite items: delete lalu insert ulang (draft itu editable)
            DB::table('reagent_request_items')
                ->where('reagent_request_id', $requestId)
                ->delete();

            if (!empty($items)) {
                $rows = [];

                foreach ($items as $it) {
                    $catalogId = (int) $it['catalog_id'];
                    $qty = (float) $it['qty'];

                    $cat = DB::table('consumables_catalog')
                        ->where('catalog_id', $catalogId)
                        ->first();

                    if (!$cat) {
                        abort(422, "Invalid catalog_id: {$catalogId}");
                    }

                    $unitText = $it['unit_text'] ?? ($cat->default_unit_text ?? null);
                    $note = $it['note'] ?? null;

                    $rows[] = [
                        'reagent_request_id' => $requestId,
                        'catalog_item_id' => $catalogId,

                        // snapshot fields (biar nanti submit bisa lock snapshot dengan rapi)
                        'item_name' => $cat->name ?? null,
                        'item_type' => $cat->type ?? null,

                        'qty' => $qty,
                        'unit_text' => $unitText,
                        'note' => $note,

                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }

                DB::table('reagent_request_items')->insert($rows);
            }

            // 4) Sync bookings: (a) update existing (b) create new (c) delete removed
            $keepBookingIds = [];

            foreach ($bookings as $b) {
                $bookingId = isset($b['booking_id']) ? (int) $b['booking_id'] : null;

                $payload = [
                    'reagent_request_id' => $requestId,
                    'lo_id' => $loId,
                    'equipment_id' => (int) $b['equipment_id'],
                    'booked_by_staff_id' => $staffId,
                    'planned_start_at' => $b['planned_start_at'],
                    'planned_end_at' => $b['planned_end_at'],
                    'note' => $b['note'] ?? null,
                    'updated_at' => now(),
                ];

                if ($bookingId) {
                    // Only allow update if the booking belongs to this request (safety)
                    $exists = DB::table('equipment_bookings')
                        ->where('booking_id', $bookingId)
                        ->where('reagent_request_id', $requestId)
                        ->exists();

                    if (!$exists) {
                        abort(403, "Booking {$bookingId} is not owned by this draft request.");
                    }

                    DB::table('equipment_bookings')
                        ->where('booking_id', $bookingId)
                        ->update($payload);

                    $keepBookingIds[] = $bookingId;
                } else {
                    $newId = DB::table('equipment_bookings')->insertGetId(array_merge($payload, [
                        'status' => 'planned',
                        'created_at' => now(),
                    ]), 'booking_id');

                    $keepBookingIds[] = (int) $newId;
                }
            }

            // Delete bookings removed from payload (only those belonging to this request)
            DB::table('equipment_bookings')
                ->where('reagent_request_id', $requestId)
                ->when(!empty($keepBookingIds), fn($q) => $q->whereNotIn('booking_id', $keepBookingIds))
                ->delete();

            // Audit (created/updated)
            $newItemsCount = (int) DB::table('reagent_request_items')
                ->where('reagent_request_id', $requestId)
                ->count();

            $newBookingsCount = (int) DB::table('equipment_bookings')
                ->where('reagent_request_id', $requestId)
                ->count();

            $newValues = [
                'reagent_request_id' => (int) $requestId,
                'lo_id' => (int) $loId,
                'status' => 'draft',
                'items_count' => $newItemsCount,
                'bookings_count' => $newBookingsCount,
            ];

            AuditLogger::write(
                $created ? 'REAGENT_REQUEST_CREATED' : 'REAGENT_REQUEST_UPDATED',
                (int) $staffId,
                'reagent_requests',
                (int) $requestId,
                $oldValues,
                $newValues
            );

            return $this->payload((int) $requestId);
        });

        return ApiResponse::success($result, 'Draft saved');
    }

    /**
     * GET /v1/reagent-requests/loo/{loId}
     * Load latest request for a LOO (draft/submitted/approved/rejected) + items + bookings.
     */
    public function showByLoo(Request $request, int $loId): JsonResponse
    {
        $row = DB::table('reagent_requests')
            ->where('lo_id', $loId)
            ->orderByDesc('reagent_request_id')
            ->first();

        if (!$row) {
            return ApiResponse::success([
                'request' => null,
                'items' => [],
                'bookings' => [],
            ], 'No reagent request yet');
        }

        return ApiResponse::success($this->payload((int) $row->reagent_request_id), 'OK');
    }

    /**
     * GET /v1/reagent-requests
     * Approver inbox listing (OM/LH).
     */
    public function indexApproverInbox(Request $request): JsonResponse
    {
        $this->assertOmOrLh($request);

        $status  = strtolower((string) $request->query('status', 'submitted'));
        $search  = trim((string) $request->query('search', ''));
        $page    = max(1, (int) $request->query('page', 1));
        $perPage = (int) $request->query('per_page', 25);
        $perPage = max(1, min(100, $perPage));

        $allowedStatus = ['submitted', 'approved', 'rejected', 'draft', 'all'];
        if (!in_array($status, $allowedStatus, true)) {
            abort(422, "Invalid status. Allowed: " . implode(', ', $allowedStatus));
        }

        $base = DB::table('reagent_requests as rr')
            ->leftJoin('letters_of_order as lo', 'lo.lo_id', '=', 'rr.lo_id')
            ->leftJoin('samples as s', 's.sample_id', '=', 'lo.sample_id')
            ->leftJoin('clients as c', 'c.client_id', '=', 's.client_id')
            ->leftJoin('staffs as creator', 'creator.staff_id', '=', 'rr.created_by_staff_id')
            ->leftJoin('staffs as submitter', 'submitter.staff_id', '=', 'rr.submitted_by_staff_id')
            ->when($status !== 'all', fn($q) => $q->where('rr.status', $status))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . $search . '%';
                $q->where(function ($w) use ($like) {
                    $w->where('lo.number', 'like', $like)
                        ->orWhere('c.name', 'like', $like);
                });
            })
            ->select([
                'rr.reagent_request_id',
                'rr.lo_id',
                'rr.cycle_no',
                'rr.status',
                'rr.created_by_staff_id',
                'rr.submitted_at',
                'rr.submitted_by_staff_id',
                'rr.approved_at',
                'rr.approved_by_staff_id',
                'rr.rejected_at',
                'rr.rejected_by_staff_id',
                'rr.reject_note',
                'rr.locked_at',
                'rr.created_at',
                'rr.updated_at',

                DB::raw('lo.number as loo_number'),
                DB::raw('c.name as client_name'),
                DB::raw('creator.name as created_by_name'),
                DB::raw('submitter.name as submitted_by_name'),

                DB::raw('(select count(*) from reagent_request_items rri where rri.reagent_request_id = rr.reagent_request_id) as items_count'),
                DB::raw('(select count(*) from equipment_bookings eb where eb.reagent_request_id = rr.reagent_request_id) as bookings_count'),
            ])
            ->orderByDesc(DB::raw("coalesce(rr.submitted_at, rr.updated_at)"));

        $total = (clone $base)->count();

        $rows = $base
            ->forPage($page, $perPage)
            ->get();

        return ApiResponse::success([
            'data' => $rows,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => (int) $total,
                'total_pages' => $perPage > 0 ? (int) ceil($total / $perPage) : 1,
            ],
        ], 'OK');
    }

    /**
     * Only OM/LH may access approver inbox.
     * FE roles.ts: OPERATIONAL_MANAGER=5, LAB_HEAD=6.
     */
    private function assertOmOrLh(Request $request): void
    {
        $user = $request->user();
        $roleId = (int) ($user->role_id ?? 0);

        if (!in_array($roleId, [5, 6], true)) {
            abort(403, 'Only OM/LH can access reagent request approver inbox.');
        }
    }

    /**
     * POST /v1/reagent-requests/{id}/submit
     */
    public function submit(Request $request, int $id): JsonResponse
    {
        $staffId = $this->resolveStaffId($request);
        if (!$staffId) {
            return ApiResponse::error('Unauthorized: cannot resolve staff actor', 'unauthorized', 401);
        }

        $result = DB::transaction(function () use ($id, $staffId) {
            $req = DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) abort(404, 'Reagent request not found');
            if ($req->status !== 'draft') abort(409, "Only draft requests can be submitted (current: {$req->status})");

            $itemsCount = (int) DB::table('reagent_request_items')->where('reagent_request_id', $id)->count();
            $bookingsCount = (int) DB::table('equipment_bookings')->where('reagent_request_id', $id)->count();

            if ($itemsCount < 1 && $bookingsCount < 1) {
                abort(422, 'Cannot submit: add at least 1 item or 1 equipment booking');
            }

            $gate = $this->assertCrosscheckPassedForLoo((int) $req->lo_id);
            if (!$gate['ok']) {
                return [
                    'ok' => false,
                    'reason' => 'crosscheck_not_passed',
                    'details' => $gate,
                ];
            }

            $oldValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => (string) $req->status,
                'locked_at' => $req->locked_at,
                'submitted_at' => $req->submitted_at,
            ];

            DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->update([
                    'status' => 'submitted',
                    'submitted_at' => now(),
                    'submitted_by_staff_id' => $staffId,
                    'locked_at' => now(),
                    'updated_at' => now(),
                ]);

            $newValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => 'submitted',
                'submitted_by_staff_id' => (int) $staffId,
                'locked_at' => now()->toISOString(),
                'submitted_at' => now()->toISOString(),
            ];

            AuditLogger::write(
                'REAGENT_REQUEST_SUBMITTED',
                (int) $staffId,
                'reagent_requests',
                (int) $req->reagent_request_id,
                $oldValues,
                $newValues
            );

            return [
                'ok' => true,
                'payload' => $this->payload($id),
            ];
        });

        if (isset($result['ok']) && $result['ok'] === false) {
            return ApiResponse::error('Crosscheck gate not passed', 'crosscheck_not_passed', 422, $result['details']);
        }

        return ApiResponse::success($result['payload'], 'Submitted');
    }

    /**
     * POST /v1/reagent-requests/{id}/approve
     * OM/LH approves a submitted reagent request and generates official PDF from DOCX template.
     *
     * NOTE:
     * - Atomic approach: if PDF generation fails, approval is rolled back (status stays submitted).
     * - Output PDF stored in DB files + registered in generated_documents.
     * - For backward-compat, reagent_requests.file_url is set to /api/v1/files/{file_id}.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $this->assertOmOrLh($request);

        $actorStaffId = $this->resolveActorStaffId($request);

        $result = DB::transaction(function () use ($id, $actorStaffId) {
            $req = DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) abort(404, 'Reagent request not found');
            if ($req->status !== 'submitted') abort(422, 'Only submitted reagent requests can be approved.');

            $oldValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => (string) $req->status,
                'approved_at' => $req->approved_at,
                'approved_by_staff_id' => $req->approved_by_staff_id,
                'rejected_at' => $req->rejected_at,
                'rejected_by_staff_id' => $req->rejected_by_staff_id,
                'reject_note' => $req->reject_note,
                'file_url' => $req->file_url ?? null,
            ];

            $approvedAt = now();

            // 1) Approve (but still inside TX; if doc generation fails, this will rollback)
            DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->update([
                    'status' => 'approved',
                    'approved_at' => $approvedAt,
                    'approved_by_staff_id' => $actorStaffId,

                    'rejected_at' => null,
                    'rejected_by_staff_id' => null,
                    'reject_note' => null,

                    'updated_at' => now(),
                ]);

            // 2) Generate official PDF from DOCX template (DB template -> merged docx -> LO pdf -> files + generated_documents)
            $gd = $this->docs->generateApprovedPdf($id, (int) $actorStaffId, false, $approvedAt);

            $downloadUrl = url("/api/v1/files/{$gd->file_pdf_id}");

            // 3) Backward compat: also fill reagent_requests.file_url with API download URL
            $pdfGeneratedAt = now();

            $beforePdf = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => 'approved',
                'file_url' => $req->file_url ?? null,
            ];

            DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->update([
                    'file_url' => $downloadUrl,
                    'updated_at' => $pdfGeneratedAt,
                ]);

            $afterPdf = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => 'approved',
                'file_url' => $downloadUrl,
                'pdf_generated_at' => $pdfGeneratedAt->toISOString(),
                'gen_doc_id' => (int) ($gd->gen_doc_id ?? 0),
                'file_pdf_id' => (int) ($gd->file_pdf_id ?? 0),
                'record_no' => (string) ($gd->record_no ?? ''),
                'template_version' => (int) ($gd->template_version ?? 0),
            ];

            AuditLogger::write(
                'REAGENT_REQUEST_PDF_GENERATED',
                (int) $actorStaffId,
                'reagent_requests',
                (int) $id,
                $beforePdf,
                $afterPdf
            );

            // 4) Approval audit
            $newValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => 'approved',
                'approved_at' => $approvedAt->toISOString(),
                'approved_by_staff_id' => (int) $actorStaffId,
                'rejected_at' => null,
                'rejected_by_staff_id' => null,
                'reject_note' => null,
                'file_url' => $downloadUrl,
                'file_pdf_id' => (int) ($gd->file_pdf_id ?? 0),
                'gen_doc_id' => (int) ($gd->gen_doc_id ?? 0),
            ];

            AuditLogger::write(
                'REAGENT_REQUEST_APPROVED',
                (int) $actorStaffId,
                'reagent_requests',
                (int) $id,
                $oldValues,
                $newValues
            );

            // 5) Return payload + pdf meta (handy for FE)
            $out = $this->payload((int) $id);
            $out['pdf'] = [
                'gen_doc_id' => (int) ($gd->gen_doc_id ?? 0),
                'file_pdf_id' => (int) ($gd->file_pdf_id ?? 0),
                'download_url' => $downloadUrl,
                'record_no' => (string) ($gd->record_no ?? ''),
                'form_code' => (string) ($gd->form_code ?? ''),
                'revision_no' => (int) ($gd->revision_no ?? 0),
                'template_version' => (int) ($gd->template_version ?? 0),
                'generated_at' => optional($gd->generated_at)->toISOString(),
            ];

            return $out;
        });

        return ApiResponse::success($result, 'Approved');
    }

    /**
     * POST /v1/reagent-requests/{id}/reject
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        $this->assertOmOrLh($request);

        $data = $request->validate([
            'reject_note' => ['required', 'string', 'min:3'],
        ]);

        $actorStaffId = $this->resolveActorStaffId($request);
        $note = trim($data['reject_note']);

        $result = DB::transaction(function () use ($id, $actorStaffId, $note) {
            $req = DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->lockForUpdate()
                ->first();

            if (!$req) abort(404, 'Reagent request not found');
            if ($req->status !== 'submitted') abort(422, 'Only submitted reagent requests can be rejected.');

            $oldValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => (string) $req->status,
                'approved_at' => $req->approved_at,
                'approved_by_staff_id' => $req->approved_by_staff_id,
                'rejected_at' => $req->rejected_at,
                'rejected_by_staff_id' => $req->rejected_by_staff_id,
                'reject_note' => $req->reject_note,
            ];

            $rejectedAt = now();

            DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->update([
                    'status' => 'rejected',
                    'rejected_at' => $rejectedAt,
                    'rejected_by_staff_id' => $actorStaffId,
                    'reject_note' => $note,

                    'approved_at' => null,
                    'approved_by_staff_id' => null,

                    'updated_at' => now(),
                ]);

            $newValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => 'rejected',
                'rejected_at' => $rejectedAt->toISOString(),
                'rejected_by_staff_id' => (int) $actorStaffId,
                'reject_note' => (string) $note,
                'approved_at' => null,
                'approved_by_staff_id' => null,
            ];

            AuditLogger::write(
                'REAGENT_REQUEST_REJECTED',
                (int) $actorStaffId,
                'reagent_requests',
                (int) $id,
                $oldValues,
                $newValues
            );

            return $this->payload((int) $id);
        });

        return ApiResponse::success($result, 'Rejected');
    }

    /**
     * Resolve actor staff_id from authenticated user.
     */
    private function resolveActorStaffId(Request $request): int
    {
        $user = $request->user();

        if (!empty($user->staff_id)) return (int) $user->staff_id;
        if (isset($user->staff) && !empty($user->staff->staff_id)) return (int) $user->staff->staff_id;
        if (!empty($user->id)) return (int) $user->id;

        abort(500, 'Cannot resolve actor staff_id for approval.');
    }

    private function payload(int $requestId): array
    {
        $req = DB::table('reagent_requests')
            ->where('reagent_request_id', $requestId)
            ->first();

        $items = DB::table('reagent_request_items')
            ->where('reagent_request_id', $requestId)
            ->orderBy('item_name')
            ->get();

        $bookings = DB::table('equipment_bookings')
            ->where('reagent_request_id', $requestId)
            ->orderBy('planned_start_at')
            ->get();

        return [
            'request' => $req,
            'items' => $items,
            'bookings' => $bookings,
        ];
    }

    private function assertCrosscheckPassedForLoo(int $loId): array
    {
        $sampleIds = DB::table('letter_of_order_items')
            ->where('lo_id', $loId)
            ->pluck('sample_id')
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (empty($sampleIds)) {
            return [
                'ok' => false,
                'total' => 0,
                'passed' => 0,
                'not_passed_samples' => [],
                'message' => 'LOO has no samples linked (letter_of_order_items.sample_id empty)',
            ];
        }

        $rows = DB::table('samples')
            ->select('sample_id', 'lab_sample_code', 'crosscheck_status')
            ->whereIn('sample_id', $sampleIds)
            ->get();

        $total = $rows->count();
        $notPassed = $rows->filter(function ($r) {
            return ($r->crosscheck_status ?? 'pending') !== 'passed';
        })->values();

        return [
            'ok' => $notPassed->count() === 0,
            'total' => $total,
            'passed' => $total - $notPassed->count(),
            'not_passed_samples' => $notPassed->map(fn($r) => [
                'sample_id' => $r->sample_id,
                'lab_sample_code' => $r->lab_sample_code,
                'crosscheck_status' => $r->crosscheck_status ?? 'pending',
            ])->all(),
        ];
    }

    /**
     * Copy pola dari controller lain:
     * - coba header X-Staff-Id
     * - fallback ke auth user -> staff
     */
    private function resolveStaffId(Request $request): ?int
    {
        $u = $request->user();

        if ($u instanceof Staff) {
            return (int) $u->staff_id;
        }

        if ($u && isset($u->staff_id) && is_numeric($u->staff_id)) {
            return (int) $u->staff_id;
        }

        $id = Auth::id();
        return is_numeric($id) ? (int) $id : null;
    }
}
