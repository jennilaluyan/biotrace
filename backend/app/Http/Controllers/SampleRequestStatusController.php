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
        // ✅ IMPORTANT: use sanctum request user (not web session) to avoid "System Staff" actor
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
     * Supports multiple client payload shapes (to stay compatible with frontend/service):
     * - { action: "accept"|"return"|"received", note?: string }
     * - { status: "ready_for_delivery"|"returned"|"physically_received", note?: string }
     * - { request_status: "...", note?: string }
     * - { nextStatus: "...", note?: string }
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        $this->assertAdminOr403($request);

        // ✅ Use request user (sanctum) to compute staffId (prevents "System Staff")
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

        // Map status-based payload into an "action" (for compatibility)
        if ($action === '' && $statusFromBody !== '') {
            if ($statusFromBody === 'ready_for_delivery') $action = 'accept';
            if ($statusFromBody === 'returned' || $statusFromBody === 'needs_revision') $action = 'return';
            if ($statusFromBody === 'physically_received') $action = 'received';
        }

        if (!in_array($action, ['accept', 'return', 'received'], true)) {
            return response()->json(['message' => 'Invalid action.'], 422);
        }

        $current = strtolower((string) ($sample->request_status ?? ''));

        if ($current === 'draft') {
            return response()->json(['message' => 'Draft requests are not available in backoffice.'], 403);
        }

        // ✅ Capture old status BEFORE any mutation (for correct audit)
        $oldRequestStatus = (string) ($sample->request_status ?? '');

        // Allowed transitions:
        // - accept: from submitted/returned/needs_revision
        // - return: from submitted/returned/needs_revision + fail-path (returned_to_admin/inspection_failed)
        // - received: from ready_for_delivery (normal flow)
        if ($action === 'received') {
            if ($current !== 'ready_for_delivery') {
                // If it is already physically_received, treat as idempotent success
                if ($current === 'physically_received') {
                    $sample->load(['client', 'requestedParameters']);
                    return response()->json(['data' => $sample->fresh()], 200);
                }

                return response()->json([
                    'message' => 'You are not allowed to mark physically received from the current status.',
                    'details' => ['request_status' => [$current]],
                ], 422);
            }
        } else {
            $allowedFrom = ($action === 'accept')
                ? ['submitted', 'returned', 'needs_revision']
                : ['submitted', 'returned', 'needs_revision', 'returned_to_admin', 'inspection_failed'];

            if (!in_array($current, $allowedFrom, true)) {
                return response()->json([
                    'message' => 'You are not allowed to perform this request status transition.',
                    'details' => ['request_status' => [$current]],
                ], 403);
            }
        }

        $note = trim((string) $request->get('note', ''));

        if ($action === 'return' && $note === '') {
            return response()->json([
                'message' => 'Return note is required.',
                'details' => ['note' => ['Return note is required.']],
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

                $payload = [
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => $action === 'accept'
                        ? 'REQUEST_ACCEPTED'
                        : ($action === 'return' ? 'REQUEST_RETURNED' : 'REQUEST_PHYSICALLY_RECEIVED'),

                    // actor fields (schema-safe; masuk hanya kalau kolom ada)
                    'staff_id' => $staffId ?: null,
                    'performed_by' => $staffId ?: null,
                    'user_id' => $staffId ?: null,
                    'performed_at' => $now,
                    'timestamp' => $now,
                    'ip_address' => request()->ip(),

                    'note' => $action === 'return' ? $note : null,
                    'meta' => ($action === 'return' && $note !== '')
                        ? json_encode(['note' => $note])
                        : null,

                    'old_values' => json_encode(['request_status' => $oldRequestStatus]),
                    'new_values' => json_encode([
                        'request_status' => $sample->request_status,
                        'note' => $action === 'return' ? $note : null,
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
