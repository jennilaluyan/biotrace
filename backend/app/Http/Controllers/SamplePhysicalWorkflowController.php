<?php

namespace App\Http\Controllers;

use App\Http\Requests\SamplePhysicalWorkflowUpdateRequest;
use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SamplePhysicalWorkflowController extends Controller
{
    /**
     * PATCH /api/v1/samples/{sample}/physical-workflow
     *
     * Body:
     * - action: string (enum)
     * - note: nullable string
     */
    public function update(SamplePhysicalWorkflowUpdateRequest $request, Sample $sample): JsonResponse
    {
        $data = $request->validated();
        $action = (string) $data['action'];
        $note = $data['note'] ?? null;

        /** @var mixed $actor */
        $actor = Auth::user();
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // Policy-based auth (role gates per action)
        $this->authorize('updatePhysicalWorkflow', [$sample, $action]);

        // Ordered workflow definition
        $steps = [
            'admin_received_from_client' => [
                'col' => 'admin_received_from_client_at',
                'requires' => [],
            ],
            'admin_brought_to_collector' => [
                'col' => 'admin_brought_to_collector_at',
                'requires' => ['admin_received_from_client_at'],
            ],
            'collector_received' => [
                'col' => 'collector_received_at',
                'requires' => ['admin_brought_to_collector_at'],
            ],
            'collector_intake_completed' => [
                'col' => 'collector_intake_completed_at',
                'requires' => ['collector_received_at'],
            ],
            'collector_returned_to_admin' => [
                'col' => 'collector_returned_to_admin_at',
                'requires' => ['collector_intake_completed_at'],
            ],
            'admin_received_from_collector' => [
                'col' => 'admin_received_from_collector_at',
                'requires' => ['collector_returned_to_admin_at'],
            ],
            'client_picked_up' => [
                'col' => 'client_picked_up_at',
                'requires' => ['admin_received_from_collector_at'],
            ],
        ];

        $def = $steps[$action] ?? null;
        if ($def === null) {
            return response()->json(['message' => 'Invalid action.'], 422);
        }

        $targetCol = (string) $def['col'];
        $requires = (array) ($def['requires'] ?? []);

        // Enforce "no skipping steps"
        foreach ($requires as $reqCol) {
            if (!Schema::hasColumn('samples', $reqCol)) {
                // If schema is missing a required column, better fail loudly than silently corrupt workflow
                return response()->json(['message' => "Server schema missing required column: {$reqCol}"], 500);
            }
            if (empty($sample->{$reqCol})) {
                return response()->json([
                    'message' => "You cannot perform '{$action}' before '{$reqCol}' is set.",
                ], 422);
            }
        }

        if (!Schema::hasColumn('samples', $targetCol)) {
            return response()->json(['message' => "Server schema missing column: {$targetCol}"], 500);
        }

        $oldValues = [
            'request_status' => $sample->request_status ?? null,
            $targetCol => $sample->{$targetCol} ?? null,
        ];

        DB::transaction(function () use ($sample, $action, $targetCol, $actor, $note, $oldValues) {
            // Idempotent: if already set, don't overwrite the original timestamp
            if (empty($sample->{$targetCol})) {
                $sample->{$targetCol} = now();
            }

            // Special: when admin receives from client, we also align with existing request_status flow
            if ($action === 'admin_received_from_client') {
                // This matches existing behavior when status becomes physically_received
                // (your SampleRequestStatusController sets physically_received_at and optional received_at)
                if (Schema::hasColumn('samples', 'physically_received_at') && empty($sample->physically_received_at)) {
                    $sample->physically_received_at = now();
                }
                if (Schema::hasColumn('samples', 'received_at') && empty($sample->received_at)) {
                    $sample->received_at = now();
                }

                // Ensure request_status reflects reality
                if (($sample->request_status ?? null) !== 'physically_received') {
                    $sample->request_status = 'physically_received';
                }
            }

            $sample->save();

            // AUDIT LOG (schema-safe, same style as SampleRequestStatusController)
            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));

                $newValues = [
                    'request_status' => $sample->request_status ?? null,
                    $targetCol => $sample->{$targetCol} ?? null,
                ];

                $audit = [
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => 'SAMPLE_PHYSICAL_WORKFLOW_CHANGED',
                    'old_values' => json_encode($oldValues),
                    'new_values' => json_encode($newValues),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];

                if (isset($cols['notes'])) {
                    $audit['notes'] = $note;
                } elseif (isset($cols['note'])) {
                    $audit['note'] = $note;
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

        // Return a small, stable payload
        return response()->json([
            'data' => [
                'sample_id' => $sample->sample_id,
                'request_status' => $sample->request_status,
                'physically_received_at' => $sample->physically_received_at ?? null,
                'received_at' => $sample->received_at ?? null,

                'admin_received_from_client_at' => $sample->admin_received_from_client_at ?? null,
                'admin_brought_to_collector_at' => $sample->admin_brought_to_collector_at ?? null,
                'collector_received_at' => $sample->collector_received_at ?? null,
                'collector_intake_completed_at' => $sample->collector_intake_completed_at ?? null,
                'collector_returned_to_admin_at' => $sample->collector_returned_to_admin_at ?? null,
                'admin_received_from_collector_at' => $sample->admin_received_from_collector_at ?? null,
                'client_picked_up_at' => $sample->client_picked_up_at ?? null,
            ],
        ], 200);
    }
}
