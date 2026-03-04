<?php

namespace App\Http\Controllers;

use App\Models\Method;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\SampleRequestStatusTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleRequestStatusController extends Controller
{
    /**
     * POST /api/v1/samples/{sample}/request-status
     *
     * Payload styles supported (front-end compatibility):
     * - { action: "accept"|"reject"|"return"|"received", note?: string, test_method_id?: number }
     * - { request_status: "ready_for_delivery"|... , note?: string, test_method_id?: number }
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        /** @var mixed $user */
        $user = Auth::user();
        if (!$user instanceof Staff) {
            return response()->json([
                'message' => 'Authenticated staff not found.',
            ], 401);
        }

        $action = trim((string) $request->input('action', ''));
        $targetRaw = trim((string) $request->input('request_status', ''));

        $note = $request->input('note');
        $note = is_string($note) ? trim($note) : null;

        $testMethodId = (int) ($request->input('test_method_id') ?? 0);

        $target = $this->resolveTargetStatus($action, $targetRaw);
        if ($target === '') {
            return response()->json([
                'message' => 'Invalid request payload (missing action/request_status).',
            ], 422);
        }

        // Validate status token against the enum list (if available)
        $allowed = SampleRequestStatusTransitions::allStatuses();
        if (is_array($allowed) && count($allowed) > 0 && !in_array($target, $allowed, true)) {
            return response()->json([
                'message' => 'Invalid target status.',
                'errors' => [
                    'request_status' => [$target],
                ],
            ], 422);
        }

        // Business rules:
        // - Accept => test_method_id required
        // - Reject/Return => note required
        if ($action === 'accept' || $target === 'ready_for_delivery') {
            if ($testMethodId <= 0) {
                return response()->json([
                    'message' => 'Test method is required to accept a request.',
                    'errors' => [
                        'test_method_id' => ['Test method is required.'],
                    ],
                ], 422);
            }
        }

        if ($action === 'reject' || $action === 'return' || $target === 'rejected' || $target === 'returned') {
            if (!$note || $note === '') {
                return response()->json([
                    'message' => 'Note is required for reject/return.',
                    'errors' => [
                        'note' => ['Note is required.'],
                    ],
                ], 422);
            }
        }

        // Authorization via transition map
        if (!SampleRequestStatusTransitions::canTransition($user, $sample, $target)) {
            return response()->json([
                'message' => 'You are not allowed to perform this request status transition.',
            ], 403);
        }

        $sampleId = (int) ($sample->sample_id ?? $sample->getKey());

        return DB::transaction(function () use ($sampleId, $sample, $user, $target, $action, $note, $testMethodId) {
            /** @var Sample $locked */
            $locked = Sample::query()
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->firstOrFail();

            $old = (string) ($locked->request_status ?? '');

            if ($old === $target) {
                return response()->json([
                    'message' => 'Request already in the requested status.',
                    'data' => $locked,
                ], 200);
            }

            $now = now();

            // First moderation timestamp (best-effort)
            if (Schema::hasColumn('samples', 'reviewed_at') && empty($locked->reviewed_at)) {
                $locked->reviewed_at = $now;
            }

            // Apply status + metadata
            $locked->request_status = $target;

            if ($target === 'ready_for_delivery') {
                if (Schema::hasColumn('samples', 'ready_at')) $locked->ready_at = $now;
                if (Schema::hasColumn('samples', 'request_approved_at')) $locked->request_approved_at = $now;

                // ✅ Store test method on the sample (source of truth for LoO)
                $this->applyTestMethod($locked, $testMethodId, (int) $user->staff_id);

                // Clear return note if present
                if (Schema::hasColumn('samples', 'request_return_note')) $locked->request_return_note = null;
                if (Schema::hasColumn('samples', 'request_returned_at')) $locked->request_returned_at = null;
            }

            if ($target === 'returned') {
                if (Schema::hasColumn('samples', 'request_return_note')) $locked->request_return_note = $note;
                if (Schema::hasColumn('samples', 'request_returned_at')) $locked->request_returned_at = $now;
            }

            if ($target === 'rejected') {
                if (Schema::hasColumn('samples', 'request_return_note')) $locked->request_return_note = $note;
                if (Schema::hasColumn('samples', 'request_returned_at')) $locked->request_returned_at = $now;
            }

            if ($target === 'physically_received') {
                if (Schema::hasColumn('samples', 'physically_received_at')) $locked->physically_received_at = $now;
            }

            $locked->save();

            // Audit log best-effort
            $this->auditRequestStatusChange(
                staffId: (int) $user->staff_id,
                sampleId: (int) $locked->sample_id,
                from: $old,
                to: $target,
                action: $this->auditActionFor($action, $target),
                note: $note,
                testMethodId: $testMethodId
            );

            $locked->refresh()->loadMissing(['client', 'requestedParameters']);

            return response()->json([
                'message' => 'Request status updated.',
                'data' => $locked,
            ], 200);
        }, 3);
    }

    private function resolveTargetStatus(string $action, string $requestStatus): string
    {
        $a = strtolower(trim($action));
        if ($a !== '') {
            return match ($a) {
                'accept', 'approve' => 'ready_for_delivery',
                'reject' => 'rejected',
                'return' => 'returned',
                'received' => 'physically_received',
                default => '',
            };
        }

        $s = strtolower(trim($requestStatus));
        if ($s === '') return '';

        // Allow UI to pass alias tokens
        if ($s === 'needs_revision') return 'returned';

        return $s;
    }

    private function applyTestMethod(Sample $sample, int $methodId, int $staffId): void
    {
        if ($methodId <= 0) return;

        // Validate method exists
        $method = Method::query()
            ->where('method_id', $methodId)
            ->where('is_active', true)
            ->first();

        if (!$method) {
            abort(422, 'Selected test method not found or inactive.');
        }

        if (Schema::hasColumn('samples', 'test_method_id')) {
            $sample->test_method_id = (int) $method->method_id;
        }
        if (Schema::hasColumn('samples', 'test_method_name')) {
            $sample->test_method_name = (string) $method->name;
        }
        if (Schema::hasColumn('samples', 'test_method_set_by_staff_id')) {
            $sample->test_method_set_by_staff_id = $staffId;
        }
        if (Schema::hasColumn('samples', 'test_method_set_at')) {
            $sample->test_method_set_at = now();
        }
    }

    private function auditActionFor(string $action, string $target): string
    {
        $a = strtolower(trim($action));
        if ($a === 'accept' || $target === 'ready_for_delivery') return 'ADMIN_SAMPLE_REQUEST_ACCEPTED';
        if ($a === 'reject' || $target === 'rejected') return 'ADMIN_SAMPLE_REQUEST_REJECTED';
        if ($a === 'return' || $target === 'returned') return 'ADMIN_SAMPLE_REQUEST_RETURNED';
        if ($a === 'received' || $target === 'physically_received') return 'ADMIN_SAMPLE_PHYSICALLY_RECEIVED';
        return 'ADMIN_SAMPLE_REQUEST_STATUS_CHANGED';
    }

    private function auditRequestStatusChange(
        int $staffId,
        int $sampleId,
        string $from,
        string $to,
        string $action,
        ?string $note,
        int $testMethodId
    ): void {
        if (!Schema::hasTable('audit_logs')) return;

        try {
            $cols = array_flip(Schema::getColumnListing('audit_logs'));

            $oldValues = ['request_status' => $from];
            $newValues = [
                'request_status' => $to,
            ];

            if ($testMethodId > 0) {
                $newValues['test_method_id'] = $testMethodId;
            }
            if (is_string($note) && $note !== '') {
                $newValues['note'] = $note;
            }

            $payload = [
                'entity_name' => 'samples',
                'entity_id' => $sampleId,
                'action' => $action,
                'old_values' => json_encode($oldValues),
                'new_values' => json_encode($newValues),
                'created_at' => now(),
                'updated_at' => now(),
            ];

            // some envs have staff_id col
            if (isset($cols['staff_id'])) {
                $payload['staff_id'] = $staffId;
            }

            DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
        } catch (\Throwable) {
            // never block primary action
        }
    }
}
