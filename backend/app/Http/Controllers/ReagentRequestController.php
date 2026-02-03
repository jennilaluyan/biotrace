<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReagentRequestDraftSaveRequest;
use App\Models\Staff;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ReagentRequestController extends Controller
{
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

                    // ⚠️ catalog schema kamu pakai "item_type", tapi beberapa env mungkin "type".
                    // Kita snapshot dengan fallback aman.
                    $catType = $cat->item_type ?? ($cat->type ?? null);

                    $unitText = $it['unit_text'] ?? ($cat->default_unit_text ?? null);
                    $note = $it['note'] ?? null;

                    $rows[] = [
                        'reagent_request_id' => $requestId,
                        'catalog_item_id' => $catalogId,

                        // snapshot fields
                        'item_name' => $cat->name ?? null,
                        'item_type' => $catType,

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

            DB::table('equipment_bookings')
                ->where('reagent_request_id', $requestId)
                ->when(!empty($keepBookingIds), fn($q) => $q->whereNotIn('booking_id', $keepBookingIds))
                ->delete();

            // Audit
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
     * OM/LH approves a submitted reagent request.
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

            // ✅ Build payload for PDF (fresh)
            $data = $this->payload((int) $id);

            $requestedBy = !empty($data['request']?->created_by_staff_id)
                ? DB::table('staffs')->where('staff_id', (int) $data['request']->created_by_staff_id)->first()
                : null;

            $loo = !empty($data['request']?->lo_id)
                ? DB::table('letters_of_order')->where('lo_id', (int) $data['request']->lo_id)->first()
                : null;

            // ===== QR OM (pakai pola surat_pengujian: robust) =====
            $signatures = DB::table('loa_signatures')
                ->where('lo_id', (int) $data['request']->lo_id)
                ->get();

            $pickSig = function (array $roleCodes) use ($signatures) {
                foreach ($roleCodes as $code) {
                    $row = $signatures->firstWhere('role_code', $code);
                    if ($row) return $row;
                }
                return null;
            };

            $omSig = $pickSig(['OM', 'OPERATIONAL_MANAGER', 'OP_MANAGER', 'MANAGER_OPERASIONAL', 'MANAGER_OPS']);
            $omHash = trim((string) ($omSig->signature_hash ?? ''));

            $omVerifyUrl = $omHash !== ''
                ? url("/api/v1/loo/signatures/verify/{$omHash}")
                : (string) config('reagent_request.om_qr_fallback_url', 'https://google.com');

            $makeQrDataUri = function (?string $payload): ?string {
                $payload = $payload ? trim($payload) : '';
                if ($payload === '') return null;

                // 1) Try PNG via SimpleSoftwareIO
                try {
                    if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                        $png = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
                            ->size(110)->margin(1)->generate($payload);

                        if (is_string($png) && $png !== '') {
                            return 'data:image/png;base64,' . base64_encode($png);
                        }
                    }
                } catch (\Throwable) {
                    // ignore -> fallback svg
                }

                // 2) SVG via SimpleSoftwareIO
                try {
                    if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                        $svg = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')
                            ->size(110)->margin(0)->generate($payload);

                        if (is_string($svg) && trim($svg) !== '') {
                            $svg2 = $svg;
                            if (stripos($svg2, 'width=') === false) {
                                $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                            }
                            return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                        }
                    }
                } catch (\Throwable) {
                    // ignore -> fallback bacon
                }

                // 3) BaconQrCode SVG fallback
                try {
                    if (
                        class_exists(\BaconQrCode\Writer::class) &&
                        class_exists(\BaconQrCode\Renderer\ImageRenderer::class) &&
                        class_exists(\BaconQrCode\Renderer\RendererStyle\RendererStyle::class) &&
                        class_exists(\BaconQrCode\Renderer\Image\SvgImageBackEnd::class)
                    ) {
                        $style = new \BaconQrCode\Renderer\RendererStyle\RendererStyle(110);
                        $backend = new \BaconQrCode\Renderer\Image\SvgImageBackEnd();
                        $renderer = new \BaconQrCode\Renderer\ImageRenderer($style, $backend);
                        $writer = new \BaconQrCode\Writer($renderer);

                        $svg = $writer->writeString($payload);
                        if (is_string($svg) && trim($svg) !== '') {
                            $svg2 = $svg;
                            if (stripos($svg2, 'width=') === false) {
                                $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                            }
                            return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                        }
                    }
                } catch (\Throwable) {
                    // ignore
                }

                return null;
            };

            $omQrSrc = $makeQrDataUri($omVerifyUrl);

            // ===== PDF payload mapping (yang template kamu expect) =====
            $requestedAt = $data['request']?->submitted_at ?? $data['request']?->created_at ?? now();

            $recordNo = 'REK/LAB-BM/TKS/11';
            $recordSuffix = '';
            try {
                $recordSuffix = \Illuminate\Support\Carbon::parse($requestedAt)->format('d-m-y'); // contoh: 21-10-24
            } catch (\Throwable) {
                $recordSuffix = '';
            }

            $roleName = $this->resolveRoleNameForStaff($requestedBy);

            $pdfPayload = [
                'record_no' => $recordNo,
                'record_suffix' => $recordSuffix,
                'form_rev_code' => 'FORM/LAB-BM/TKS/11.Rev00.31-01-24',

                'requested_at' => $requestedAt,

                // ✅ “Yang meminta” = nama staff yang bikin request
                'requester_name' => (string) ($requestedBy->name ?? '-'),

                // ✅ “Bagian” = role name (best-effort)
                'requester_division' => $roleName ?: '-',

                // ✅ Hardcode sesuai template foto
                'coordinator_name' => 'Rendy V. Worotikan, S.Si',

                // OM identity sesuai template
                'om_name' => 'dr. Olivia A. Waworuntu, MPH, Sp.MK',
                'om_nip' => '197910242008012006',

                // QR OM
                'om_qr_src' => $omQrSrc,
                'om_verify_url' => $omVerifyUrl, // fallback kalau view mau generate ulang
            ];

            // Inject payload ke view dengan key "payload"
            $data['payload'] = $pdfPayload;

            // ✅ Render PDF -> store -> write file_url
            $disk = (string) config('reagent_request.storage_disk', 'local');
            $base = trim((string) config('reagent_request.storage_path', 'documents/reagent_requests'), '/');
            $year = now()->format('Y');

            $looNumber = (string) ($loo?->number ?? ('LOO-' . (int) $data['request']->lo_id));
            $safeNo = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $looNumber) ?: ('LOO_' . (int) $data['request']->lo_id);
            $safeNo = str_replace('/', '_', $safeNo);

            $cycleNo = (int) ($data['request']->cycle_no ?? 1);
            $fileName = "reagent_request_{$safeNo}_C{$cycleNo}_{$id}.pdf";
            $path = "{$base}/{$year}/{$fileName}";

            $view = (string) config('reagent_request.pdf_view', 'documents.reagent_request');

            $bytes = Pdf::loadView($view, $data)
                ->setPaper('a4', 'portrait')
                ->output();

            Storage::disk($disk)->put($path, $bytes);

            DB::table('reagent_requests')
                ->where('reagent_request_id', $id)
                ->update([
                    'file_url' => $path,
                    'updated_at' => now(),
                ]);

            $newValues = [
                'reagent_request_id' => (int) $req->reagent_request_id,
                'lo_id' => (int) $req->lo_id,
                'status' => 'approved',
                'approved_at' => $approvedAt->toISOString(),
                'approved_by_staff_id' => (int) $actorStaffId,
                'rejected_at' => null,
                'rejected_by_staff_id' => null,
                'reject_note' => null,
                'file_url' => $path,
            ];

            AuditLogger::write(
                'REAGENT_REQUEST_APPROVED',
                (int) $actorStaffId,
                'reagent_requests',
                (int) $id,
                $oldValues,
                $newValues
            );

            return $this->payload((int) $id);
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

    private function resolveActorStaffId(Request $request): int
    {
        $user = $request->user();

        if (!empty($user->staff_id)) return (int) $user->staff_id;
        if (isset($user->staff) && !empty($user->staff->staff_id)) return (int) $user->staff->staff_id;
        if (!empty($user->id)) return (int) $user->id;

        abort(500, 'Cannot resolve actor staff_id for approval.');
    }

    /**
     * Payload untuk FE + PDF.
     * NOTE: bookings diperkaya dengan equipment_name kalau tabel equipments ada.
     */
    private function payload(int $requestId): array
    {
        $req = DB::table('reagent_requests')
            ->where('reagent_request_id', $requestId)
            ->first();

        $items = DB::table('reagent_request_items')
            ->where('reagent_request_id', $requestId)
            ->orderBy('item_name')
            ->get();

        // bookings + equipment_name (best-effort)
        try {
            if (Schema::hasTable('equipments')) {
                $bookings = DB::table('equipment_bookings as eb')
                    ->leftJoin('equipments as e', 'e.equipment_id', '=', 'eb.equipment_id')
                    ->where('eb.reagent_request_id', $requestId)
                    ->orderBy('eb.planned_start_at')
                    ->select([
                        'eb.*',
                        DB::raw('e.name as equipment_name'),
                        DB::raw('e.code as equipment_code'),
                    ])
                    ->get();
            } else {
                $bookings = DB::table('equipment_bookings')
                    ->where('reagent_request_id', $requestId)
                    ->orderBy('planned_start_at')
                    ->get();
            }
        } catch (\Throwable) {
            $bookings = DB::table('equipment_bookings')
                ->where('reagent_request_id', $requestId)
                ->orderBy('planned_start_at')
                ->get();
        }

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

    /**
     * Best-effort role name:
     * - kalau ada table roles: ambil name/title
     * - kalau tidak: fallback mapping
     */
    private function resolveRoleNameForStaff($staffRow): ?string
    {
        if (!$staffRow) return null;

        $roleId = (int) ($staffRow->role_id ?? 0);
        if ($roleId <= 0) return null;

        try {
            if (Schema::hasTable('roles')) {
                $role = DB::table('roles')->where('role_id', $roleId)->first();
                $name = $role->name ?? ($role->role_name ?? null);
                if (is_string($name) && trim($name) !== '') return trim($name);
            }
        } catch (\Throwable) {
            // ignore
        }

        // fallback (sesuaikan kalau kamu punya mapping final)
        $map = [
            1 => 'Admin',
            2 => 'Staff',
            3 => 'Analis',
            4 => 'QA',
            5 => 'Manajer Operasional',
            6 => 'Kepala Laboratorium',
        ];

        return $map[$roleId] ?? null;
    }
}
