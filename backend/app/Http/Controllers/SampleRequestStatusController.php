<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
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
     * Body:
     * - target_status: string
     * - note: nullable string
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        $data = $request->validate([
            'target_status' => ['required', 'string', 'max:32'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $to = (string) $data['target_status'];
        $from = (string) ($sample->request_status ?? 'draft');

        /** @var mixed $actor */
        $actor = Auth::user();

        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $roleName = strtolower(trim((string) ($actor->role?->name ?? '')));
        $allowedRoleNames = ['admin', 'administrator'];
        if (!in_array($roleName, $allowedRoleNames, true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $allowedTransitions = [
            'draft' => ['submitted'],
            'returned' => ['submitted'],
            'needs_revision' => ['submitted'],
            'submitted' => ['ready_for_delivery', 'needs_revision'],
            'ready_for_delivery' => ['physically_received'],
            'physically_received' => [],
        ];

        $nextAllowed = $allowedTransitions[$from] ?? [];
        if (!in_array($to, $nextAllowed, true)) {
            return response()->json([
                'message' => 'You are not allowed to perform this request status transition.',
            ], 403);
        }

        DB::transaction(function () use ($sample, $from, $to, $actor, $data) {
            $sample->request_status = $to;

            if ($to === 'submitted' && empty($sample->submitted_at)) {
                $sample->submitted_at = now();
            }

            if ($to === 'physically_received') {
                if (Schema::hasColumn('samples', 'physically_received_at') && empty($sample->physically_received_at)) {
                    $sample->physically_received_at = now();
                }
                // optional: set received_at if still null
                if (Schema::hasColumn('samples', 'received_at') && empty($sample->received_at)) {
                    $sample->received_at = now();
                }
            }

            $sample->save();

            // AUDIT LOG (schema-safe)
            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));
                $audit = [
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => 'SAMPLE_REQUEST_STATUS_CHANGED',
                    'old_values' => json_encode(['request_status' => $from]),
                    'new_values' => json_encode(['request_status' => $to]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];

                if (isset($cols['notes'])) {
                    $audit['notes'] = $data['note'] ?? null;
                } elseif (isset($cols['note'])) {
                    $audit['note'] = $data['note'] ?? null;
                }

                $actorId = (int) ($actor->staff_id ?? $actor->getKey());
                if (isset($cols['staff_id'])) {
                    $audit['staff_id'] = $actorId;
                } elseif (isset($cols['performed_by'])) {
                    $audit['performed_by'] = $actorId;
                } elseif (isset($cols['actor_id'])) {
                    $audit['actor_id'] = $actorId;
                } elseif (isset($cols['created_by'])) {
                    $audit['created_by'] = $actorId;
                }

                DB::table('audit_logs')->insert(array_intersect_key($audit, $cols));
            }
        });

        $sample->load(['requestedParameters']);

        return response()->json([
            'data' => [
                'sample_id' => $sample->sample_id,
                'request_status' => $sample->request_status,
                'submitted_at' => $sample->submitted_at,
                'physically_received_at' => $sample->physically_received_at,
                'lab_sample_code' => $sample->lab_sample_code ?? null,
                'requested_parameters' => $sample->requestedParameters ?? [],
            ],
        ], 200);
    }
}