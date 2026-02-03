<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReagentRequestDraftSaveRequest;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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

        $result = DB::transaction(function () use ($loId, $staffId, $items, $bookings) {
            // 1) Ambil draft terakhir untuk LOO (kalau ada)
            $existing = DB::table('reagent_requests')
                ->where('lo_id', $loId)
                ->orderByDesc('reagent_request_id')
                ->first();

            if ($existing && in_array($existing->status, ['submitted', 'approved'], true)) {
                abort(409, 'Reagent request already submitted/approved. Create a new revision after rejection.');
            }

            // 2) Create/update request row
            if (!$existing || !in_array($existing->status, ['draft', 'rejected'], true)) {
                $requestId = DB::table('reagent_requests')->insertGetId([
                    'lo_id' => $loId,
                    'requested_by_staff_id' => $staffId,
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
            // NOTE: ini butuh kolom equipment_bookings.reagent_request_id (migration A)
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

            return $this->payload($requestId);
        });

        return ApiResponse::success($result, 'Draft saved');
    }

    /**
     * GET /v1/reagent-requests/loo/{loId}
     * Load latest request for a LOO (draft/submitted/approved/rejected) + items + bookings.
     * Ini penting buat FE nanti (Step 6.4) biar bisa load draft yang sudah tersimpan.
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

    /**
     * Copy pola dari controller lain:
     * - coba header X-Staff-Id
     * - fallback ke auth user -> staff
     */
    private function resolveStaffId(Request $request): int
    {
        $hdr = $request->header('X-Staff-Id');
        if ($hdr && is_numeric($hdr)) return (int) $hdr;

        $user = $request->user();
        if (!$user) abort(401, 'Unauthenticated');

        $staffId = DB::table('staffs')
            ->where('user_id', $user->id)
            ->value('staff_id');

        if (!$staffId) abort(403, 'No staff mapping for this user');

        return (int) $staffId;
    }
}
