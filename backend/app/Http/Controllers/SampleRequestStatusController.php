<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleRequestStatusController extends Controller
{
    private function assertAdminOr403(Request $request): void
    {
        // ✅ use sanctum request user (not web session)
        $user = $request->user() ?? Auth::guard('sanctum')->user();

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

    /**
     * POST /api/v1/samples/{sample}/request-status
     *
     * Supported payload:
     * - { action: "accept"|"reject"|"return"|"received", note?: string }
     * - { status: "ready_for_delivery"|"rejected"|"returned"|"physically_received", note?: string }
     * - { request_status: "...", note?: string }
     * - { nextStatus: "...", note?: string }
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        $this->assertAdminOr403($request);

        // ✅ Use request user (sanctum) to compute staffId
        $user = $request->user() ?? Auth::guard('sanctum')->user();
        $staffId = (int) (($user?->staff_id ?? null) ?: ($user?->id ?? 0));

        // --- Normalize incoming intent ---
        $action = strtolower(trim((string) $request->get('action', '')));

        $statusFromBody =
            (string) $request->get('status', '') ?:
            (string) $request->get('request_status', '') ?:
            (string) $request->get('nextStatus', '') ?:
            (string) $request->get('next_status', '');

        $statusFromBody = strtolower(trim($statusFromBody));

        // Map status-based payload into an "action" (compat)
        if ($action === '' && $statusFromBody !== '') {
            if ($statusFromBody === 'ready_for_delivery') $action = 'accept';
            if ($statusFromBody === 'rejected') $action = 'reject';
            if ($statusFromBody === 'returned' || $statusFromBody === 'needs_revision') $action = 'return';
            if ($statusFromBody === 'physically_received') $action = 'received';
        }

        if (!in_array($action, ['accept', 'reject', 'return', 'received'], true)) {
            return response()->json(['message' => 'Invalid action.'], 422);
        }

        $current = strtolower((string) ($sample->request_status ?? ''));

        if ($current === 'draft') {
            return response()->json(['message' => 'Draft requests are not available in backoffice.'], 403);
        }

        // ✅ idempotent handling for already-finished status
        if ($action === 'reject' && $current === 'rejected') {
            return response()->json(['data' => $sample->fresh()], 200);
        }
        if ($action === 'received' && $current === 'physically_received') {
            return response()->json(['data' => $sample->fresh()], 200);
        }
        if ($action === 'accept' && $current === 'ready_for_delivery') {
            return response()->json(['data' => $sample->fresh()], 200);
        }

        // ✅ Capture old status BEFORE any mutation (for correct audit)
        $oldRequestStatus = (string) ($sample->request_status ?? '');

        /**
         * Allowed transitions (Admin, queue context):
         * - accept:   submitted/returned/needs_revision -> ready_for_delivery
         * - reject:   submitted/returned/needs_revision -> rejected
         * - return:   legacy flow + fail-path
         * - received: ready_for_delivery -> physically_received
         */
        if ($action === 'received') {
            if ($current !== 'ready_for_delivery') {
                return response()->json([
                    'message' => 'You are not allowed to mark physically received from the current status.',
                    'details' => ['request_status' => [$current]],
                ], 422);
            }
        } else {
            $allowedFrom = match ($action) {
                'accept' => ['submitted', 'returned', 'needs_revision'],
                'reject' => ['submitted', 'returned', 'needs_revision'],
                'return' => ['submitted', 'returned', 'needs_revision', 'returned_to_admin', 'inspection_failed'],
                default => [],
            };

            if (!in_array($current, $allowedFrom, true)) {
                return response()->json([
                    'message' => 'You are not allowed to perform this request status transition.',
                    'details' => ['request_status' => [$current]],
                ], 403);
            }
        }

        $note = trim((string) $request->get('note', ''));

        // ✅ Reject needs reason, Return needs reason (legacy)
        if (($action === 'reject' || $action === 'return') && $note === '') {
            return response()->json([
                'message' => 'A note is required.',
                'details' => ['note' => ['A note is required.']],
            ], 422);
        }

        DB::transaction(function () use ($sample, $action, $note, $staffId, $oldRequestStatus) {
            $now = Carbon::now();

            if (Schema::hasColumn('samples', 'reviewed_at')) {
                $sample->reviewed_at = $now;
            }

            if ($action === 'accept') {
                if (Schema::hasColumn('samples', 'request_status')) {
                    $sample->request_status = 'ready_for_delivery';
                }
                if (Schema::hasColumn('samples', 'request_return_note')) {
                    $sample->request_return_note = null;
                }
                if (Schema::hasColumn('samples', 'request_approved_at')) {
                    $sample->request_approved_at = $now;
                }
            }

            if ($action === 'reject') {
                if (Schema::hasColumn('samples', 'request_status')) {
                    $sample->request_status = 'rejected';
                }

                // Reuse existing note column if present (schema-safe)
                if (Schema::hasColumn('samples', 'request_return_note')) {
                    $sample->request_return_note = $note;
                }

                if (Schema::hasColumn('samples', 'request_rejected_at')) {
                    $sample->request_rejected_at = $now;
                }
            }

            if ($action === 'return') {
                if (Schema::hasColumn('samples', 'request_status')) {
                    $sample->request_status = 'returned';
                }
                if (Schema::hasColumn('samples', 'request_return_note')) {
                    $sample->request_return_note = $note;
                }
                if (Schema::hasColumn('samples', 'request_returned_at')) {
                    $sample->request_returned_at = $now;
                }
            }

            if ($action === 'received') {
                if (Schema::hasColumn('samples', 'request_status')) {
                    $sample->request_status = 'physically_received';
                }
                if (Schema::hasColumn('samples', 'physically_received_at')) {
                    $sample->physically_received_at = $now;
                }

                // ✅ first physical workflow step must be green right away
                if (Schema::hasColumn('samples', 'admin_received_from_client_at')) {
                    if ($sample->admin_received_from_client_at === null) {
                        $sample->admin_received_from_client_at = $now;
                    }
                }
            }

            $sample->save();

            // optional audit log, schema-safe
            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));

                $actionLabel = match ($action) {
                    'accept' => 'REQUEST_ACCEPTED',
                    'reject' => 'REQUEST_REJECTED',
                    'return' => 'REQUEST_RETURNED',
                    'received' => 'REQUEST_PHYSICALLY_RECEIVED',
                    default => 'REQUEST_STATUS_UPDATED',
                };

                $payload = [
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => $actionLabel,

                    // actor fields (schema-safe)
                    'staff_id' => $staffId ?: null,
                    'performed_by' => $staffId ?: null,
                    'user_id' => $staffId ?: null,
                    'performed_at' => $now,
                    'timestamp' => $now,
                    'ip_address' => request()->ip(),

                    'note' => in_array($action, ['reject', 'return'], true) ? $note : null,
                    'meta' => (in_array($action, ['reject', 'return'], true) && $note !== '')
                        ? json_encode(['note' => $note])
                        : null,

                    'old_values' => json_encode(['request_status' => $oldRequestStatus]),
                    'new_values' => json_encode([
                        'request_status' => $sample->request_status,
                        'note' => in_array($action, ['reject', 'return'], true) ? $note : null,
                    ]),

                    'created_at' => $now,
                    'updated_at' => $now,
                ];

                DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
            }
        });

        $sample->load(['client', 'requestedParameters']);

        return response()->json([
            'data' => $sample->fresh(),
        ], 200);
    }
}
