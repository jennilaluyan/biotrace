<?php

namespace App\Http\Controllers;

use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class EquipmentBookingController extends Controller
{
    /**
     * POST /v1/equipment-bookings
     * Create a planned booking (planned_start/end required).
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'equipment_id' => 'required|integer|min:1',
            'lo_id' => 'sometimes|nullable|integer|min:1',
            'planned_start_at' => 'required|date',
            'planned_end_at' => 'required|date|after:planned_start_at',
            'note' => 'sometimes|nullable|string|max:2000',
        ]);

        $staffId = $this->resolveStaffId($request);
        if (!$staffId) {
            // audit-first: kalau gak ada actor, mending fail keras
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized: cannot resolve staff actor',
            ], 401);
        }

        // Validate equipment exists & active
        $equipment = DB::table('equipment_catalog')
            ->where('equipment_id', $validated['equipment_id'])
            ->first();

        if (!$equipment) {
            return ApiResponse::success(
                data: null,
                message: 'Equipment not found',
                status: 404
            );
        }

        if (property_exists($equipment, 'is_active') && !$equipment->is_active) {
            return ApiResponse::success(
                data: null,
                message: 'Equipment is inactive',
                status: 422
            );
        }

        // Validate lo_id if provided
        if (!empty($validated['lo_id'])) {
            $loExists = DB::table('letters_of_order')
                ->where('lo_id', $validated['lo_id'])
                ->exists();

            if (!$loExists) {
                return ApiResponse::success(
                    data: null,
                    message: 'LOO not found',
                    status: 404
                );
            }
        }

        $plannedStart = Carbon::parse($validated['planned_start_at'])->utc();
        $plannedEnd = Carbon::parse($validated['planned_end_at'])->utc();

        $payload = [
            'equipment_id' => (int) $validated['equipment_id'],
            'lo_id' => !empty($validated['lo_id']) ? (int) $validated['lo_id'] : null,
            'booked_by_staff_id' => (int) $staffId,
            'planned_start_at' => $plannedStart,
            'planned_end_at' => $plannedEnd,
            'actual_start_at' => null,
            'actual_end_at' => null,
            'status' => 'planned',
            'note' => $validated['note'] ?? null,
            'created_at' => Carbon::now('UTC'),
            'updated_at' => Carbon::now('UTC'),
        ];

        // Postgres: PK is booking_id, not id
        $bookingId = DB::table('equipment_bookings')->insertGetId($payload, 'booking_id');

        // Audit
        AuditLogger::write(
            action: 'EQUIP_BOOKING_CREATED',
            staffId: (int) $staffId,
            entityName: 'equipment_bookings',
            entityId: (int) $bookingId,
            oldValues: null,
            newValues: [
                'booking_id' => (int) $bookingId,
                'equipment_id' => (int) $payload['equipment_id'],
                'lo_id' => $payload['lo_id'],
                'planned_start_at' => $plannedStart->toIso8601String(),
                'planned_end_at' => $plannedEnd->toIso8601String(),
                'status' => 'planned',
            ]
        );

        $row = $this->getBookingPayload((int) $bookingId);

        return ApiResponse::success(
            data: $row,
            message: 'Equipment booking created',
            status: 201
        );
    }

    /**
     * PATCH /v1/equipment-bookings/{bookingId}
     * Update planned window / status / note (NOT actual times).
     */
    public function update(Request $request, int $bookingId)
    {
        $validated = $request->validate([
            'planned_start_at' => 'sometimes|date',
            'planned_end_at' => 'sometimes|date',
            'status' => 'sometimes|string|in:planned,in_use,completed,cancelled',
            'note' => 'sometimes|nullable|string|max:2000',
        ]);

        $staffId = $this->resolveStaffId($request);
        if (!$staffId) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized: cannot resolve staff actor',
            ], 401);
        }

        $existing = DB::table('equipment_bookings')->where('booking_id', $bookingId)->first();
        if (!$existing) {
            return ApiResponse::success(data: null, message: 'Booking not found', status: 404);
        }

        // If both provided, validate ordering (Laravel validates each independently, so we enforce here too)
        $plannedStart = array_key_exists('planned_start_at', $validated)
            ? Carbon::parse($validated['planned_start_at'])->utc()
            : Carbon::parse($existing->planned_start_at)->utc();

        $plannedEnd = array_key_exists('planned_end_at', $validated)
            ? Carbon::parse($validated['planned_end_at'])->utc()
            : Carbon::parse($existing->planned_end_at)->utc();

        if ($plannedEnd->lessThanOrEqualTo($plannedStart)) {
            return ApiResponse::success(data: null, message: 'planned_end_at must be after planned_start_at', status: 422);
        }

        $nextStatus = $validated['status'] ?? $existing->status;

        // If cancelling, require note (biar audit trail meaningful)
        if ($nextStatus === 'cancelled') {
            $note = $validated['note'] ?? $existing->note;
            if (!$note || trim((string) $note) === '') {
                return ApiResponse::success(data: null, message: 'note is required when cancelling a booking', status: 422);
            }
        }

        $update = [
            'planned_start_at' => $plannedStart,
            'planned_end_at' => $plannedEnd,
            'status' => $nextStatus,
            'updated_at' => Carbon::now('UTC'),
        ];

        if (array_key_exists('note', $validated)) {
            $update['note'] = $validated['note'];
        }

        // Diff for audit
        $old = [
            'planned_start_at' => Carbon::parse($existing->planned_start_at)->utc()->toIso8601String(),
            'planned_end_at' => Carbon::parse($existing->planned_end_at)->utc()->toIso8601String(),
            'status' => $existing->status,
            'note' => $existing->note,
        ];

        $new = [
            'planned_start_at' => $plannedStart->toIso8601String(),
            'planned_end_at' => $plannedEnd->toIso8601String(),
            'status' => $nextStatus,
            'note' => array_key_exists('note', $update) ? $update['note'] : $existing->note,
        ];

        DB::table('equipment_bookings')->where('booking_id', $bookingId)->update($update);

        AuditLogger::write(
            action: $nextStatus === 'cancelled' ? 'EQUIP_BOOKING_CANCEL' : 'EQUIP_BOOKING_UPDATED',
            staffId: (int) $staffId,
            entityName: 'equipment_bookings',
            entityId: (int) $bookingId,
            oldValues: $old,
            newValues: $new
        );

        $row = $this->getBookingPayload((int) $bookingId);

        return ApiResponse::success(
            data: $row,
            message: 'Equipment booking updated',
            status: 200
        );
    }

    /**
     * PATCH /v1/equipment-bookings/{bookingId}/actual
     * Update actual_start/end times; auto-updates status:
     * - if actual_start_at set and end null => in_use
     * - if actual_end_at set => completed
     */
    public function updateActual(Request $request, int $bookingId)
    {
        $validated = $request->validate([
            'actual_start_at' => 'sometimes|nullable|date',
            'actual_end_at' => 'sometimes|nullable|date',
            'note' => 'sometimes|nullable|string|max:2000',
        ]);

        $staffId = $this->resolveStaffId($request);
        if (!$staffId) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized: cannot resolve staff actor',
            ], 401);
        }

        $existing = DB::table('equipment_bookings')->where('booking_id', $bookingId)->first();
        if (!$existing) {
            return ApiResponse::success(data: null, message: 'Booking not found', status: 404);
        }

        $curStart = $existing->actual_start_at ? Carbon::parse($existing->actual_start_at)->utc() : null;
        $curEnd = $existing->actual_end_at ? Carbon::parse($existing->actual_end_at)->utc() : null;

        $nextStart = array_key_exists('actual_start_at', $validated)
            ? ($validated['actual_start_at'] ? Carbon::parse($validated['actual_start_at'])->utc() : null)
            : $curStart;

        $nextEnd = array_key_exists('actual_end_at', $validated)
            ? ($validated['actual_end_at'] ? Carbon::parse($validated['actual_end_at'])->utc() : null)
            : $curEnd;

        // If end is set, start must exist (either in payload or already)
        if ($nextEnd && !$nextStart) {
            return ApiResponse::success(data: null, message: 'actual_start_at is required before setting actual_end_at', status: 422);
        }

        // If both exist, validate ordering
        if ($nextStart && $nextEnd && $nextEnd->lessThanOrEqualTo($nextStart)) {
            return ApiResponse::success(data: null, message: 'actual_end_at must be after actual_start_at', status: 422);
        }

        $nextStatus = $existing->status;
        if ($nextEnd) {
            $nextStatus = 'completed';
        } elseif ($nextStart) {
            $nextStatus = 'in_use';
        }

        $update = [
            'actual_start_at' => $nextStart,
            'actual_end_at' => $nextEnd,
            'status' => $nextStatus,
            'updated_at' => Carbon::now('UTC'),
        ];

        if (array_key_exists('note', $validated)) {
            $update['note'] = $validated['note'];
        }

        $old = [
            'actual_start_at' => $curStart?->toIso8601String(),
            'actual_end_at' => $curEnd?->toIso8601String(),
            'status' => $existing->status,
            'note' => $existing->note,
        ];

        $new = [
            'actual_start_at' => $nextStart?->toIso8601String(),
            'actual_end_at' => $nextEnd?->toIso8601String(),
            'status' => $nextStatus,
            'note' => array_key_exists('note', $update) ? $update['note'] : $existing->note,
        ];

        DB::table('equipment_bookings')->where('booking_id', $bookingId)->update($update);

        AuditLogger::write(
            action: 'EQUIP_BOOKING_ACTUAL',
            staffId: (int) $staffId,
            entityName: 'equipment_bookings',
            entityId: (int) $bookingId,
            oldValues: $old,
            newValues: $new
        );

        $row = $this->getBookingPayload((int) $bookingId);

        return ApiResponse::success(
            data: $row,
            message: 'Equipment booking actual times updated',
            status: 200
        );
    }

    /**
     * Best-effort resolve staff_id from auth user.
     * Adjust mapping here if your auth user object uses a different field name.
     */
    private function resolveStaffId(Request $request): ?int
    {
        $u = $request->user();
        if (!$u) return null;

        // Most likely in your project
        if (isset($u->staff_id) && is_numeric($u->staff_id)) return (int) $u->staff_id;

        // Fallbacks (depends on how Staff is authenticated)
        if (isset($u->id) && is_numeric($u->id)) return (int) $u->id;

        return null;
    }

    /**
     * Return booking payload joined with equipment basic data (so FE doesn't need extra call).
     */
    private function getBookingPayload(int $bookingId): ?array
    {
        $row = DB::table('equipment_bookings as b')
            ->join('equipment_catalog as e', 'e.equipment_id', '=', 'b.equipment_id')
            ->where('b.booking_id', $bookingId)
            ->select([
                'b.booking_id',
                'b.lo_id',
                'b.equipment_id',
                'e.equipment_code',
                'e.name as equipment_name',
                'b.booked_by_staff_id',
                'b.planned_start_at',
                'b.planned_end_at',
                'b.actual_start_at',
                'b.actual_end_at',
                'b.status',
                'b.note',
                'b.created_at',
                'b.updated_at',
            ])
            ->first();

        if (!$row) return null;

        return [
            'booking_id' => (int) $row->booking_id,
            'lo_id' => $row->lo_id !== null ? (int) $row->lo_id : null,
            'equipment' => [
                'equipment_id' => (int) $row->equipment_id,
                'equipment_code' => (string) $row->equipment_code,
                'name' => (string) $row->equipment_name,
            ],
            'booked_by_staff_id' => (int) $row->booked_by_staff_id,
            'planned_start_at' => $row->planned_start_at,
            'planned_end_at' => $row->planned_end_at,
            'actual_start_at' => $row->actual_start_at,
            'actual_end_at' => $row->actual_end_at,
            'status' => (string) $row->status,
            'note' => $row->note,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];
    }
}
