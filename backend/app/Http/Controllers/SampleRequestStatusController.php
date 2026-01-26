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
    private function assertAdminOr403(): void
    {
        $user = Auth::user(); // staff (sanctum)
        $roleName = strtolower((string) ($user?->role?->name ?? $user?->role_name ?? ''));
        $roleId = (int) ($user?->role_id ?? 0);

        // Accept common variants
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
     * body: { action: "accept"|"return", note?: string }
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        $this->assertAdminOr403();

        $action = strtolower(trim((string) $request->get('action', '')));
        if (!in_array($action, ['accept', 'return'], true)) {
            return response()->json(['message' => 'Invalid action.'], 422);
        }

        $current = strtolower((string) ($sample->request_status ?? ''));
        if ($current === 'draft') {
            return response()->json(['message' => 'Draft requests are not available in backoffice.'], 403);
        }

        // Only allow transitions from submitted/returned/needs_revision
        $allowedFrom = ['submitted', 'returned', 'needs_revision'];
        if (!in_array($current, $allowedFrom, true)) {
            return response()->json([
                'message' => 'You are not allowed to perform this request status transition.',
            ], 403);
        }

        $note = (string) $request->get('note', '');
        $note = trim($note);

        if ($action === 'return') {
            if ($note === '') {
                return response()->json([
                    'message' => 'Return note is required.',
                    'details' => ['note' => ['Return note is required.']],
                ], 422);
            }
        }

        DB::transaction(function () use ($sample, $action, $note) {
            $now = Carbon::now();

            if (Schema::hasColumn('samples', 'reviewed_at')) {
                $sample->reviewed_at = $now;
            }

            if ($action === 'accept') {
                if (Schema::hasColumn('samples', 'request_status')) {
                    $sample->request_status = 'ready_for_delivery';
                }
                if (Schema::hasColumn('samples', 'request_return_note')) {
                    $sample->request_return_note = null; // clear old return note
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

            $sample->save();

            // optional audit log, schema-safe
            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));
                $payload = [
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => $action === 'accept' ? 'REQUEST_ACCEPTED' : 'REQUEST_RETURNED',
                    'old_values' => json_encode(['request_status' => $sample->getOriginal('request_status')]),
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