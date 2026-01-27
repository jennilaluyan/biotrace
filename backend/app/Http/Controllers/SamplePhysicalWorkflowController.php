<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleCustodyEventRequest;
use App\Http\Requests\SamplePhysicalWorkflowUpdateRequest;
use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Enums\SampleRequestStatus;

class SamplePhysicalWorkflowController extends Controller
{
    /**
     * PATCH /v1/samples/{id}/physical-workflow
     * body: { action, note? }
     */
    public function update(SamplePhysicalWorkflowUpdateRequest $request, Sample $sample): JsonResponse
    {
        $data = $request->validated();
        $action = $data['action'];
        $note = $data['note'] ?? null;

        return $this->applyEvent($sample, $action, $note);
    }

    /**
     * POST /v1/samples/{id}/custody
     * body: { event_key, note? }
     */
    public function store(SampleCustodyEventRequest $request, Sample $sample): JsonResponse
    {
        $data = $request->validated();
        $action = $data['event_key'];
        $note = $data['note'] ?? null;

        return $this->applyEvent($sample, $action, $note);
    }

    private function applyEvent(Sample $sample, string $action, ?string $note): JsonResponse
    {
        /** @var mixed $actor */
        $actor = request()->user();

        // Hard guard: this endpoint is for Staff only
        if (!$actor instanceof Staff) {
            return response()->json([
                'status' => 403,
                'code' => 'LIMS.AUTH.FORBIDDEN',
                'message' => 'Forbidden.',
            ], 403);
        }

        // Policy check (role-based)
        $this->authorize('updatePhysicalWorkflow', [$sample, $action]);

        /**
         * Step chain (by key), then we resolve each step into an actual column name that exists.
         * This makes the code tolerant if migration column naming differs.
         */
        $steps = [
            'admin_received_from_client' => [
                'col_candidates' => ['admin_received_from_client_at'],
                'requires' => [],
            ],
            'admin_brought_to_collector' => [
                'col_candidates' => ['admin_brought_to_collector_at', 'admin_handed_to_collector_at'],
                'requires' => ['admin_received_from_client'],
            ],
            'collector_received' => [
                'col_candidates' => ['collector_received_at'],
                'requires' => ['admin_brought_to_collector'],
            ],
            'collector_intake_completed' => [
                'col_candidates' => ['collector_intake_completed_at', 'collector_completed_at'],
                'requires' => ['collector_received'],
            ],
            'collector_returned_to_admin' => [
                'col_candidates' => ['collector_returned_to_admin_at'],
                'requires' => ['collector_intake_completed'],
            ],
            'admin_received_from_collector' => [
                'col_candidates' => ['admin_received_from_collector_at'],
                'requires' => ['collector_returned_to_admin'],
            ],
            'client_picked_up' => [
                'col_candidates' => ['client_picked_up_at'],
                'requires' => ['admin_received_from_collector'],
            ],
        ];

        if (!isset($steps[$action])) {
            return response()->json([
                'status' => 422,
                'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                'message' => 'Invalid action.',
                'details' => [
                    ['field' => 'action', 'message' => 'Unsupported action.'],
                ],
            ], 422);
        }

        $resolveCol = function (array $candidates): ?string {
            foreach ($candidates as $c) {
                if (Schema::hasColumn('samples', $c)) return $c;
            }
            return null;
        };

        // Resolve all step columns (so requires can be checked safely)
        $resolved = [];
        foreach ($steps as $key => $cfg) {
            $resolved[$key] = $resolveCol($cfg['col_candidates']);
        }

        $targetCol = $resolved[$action];
        if (!$targetCol) {
            return response()->json([
                'status' => 500,
                'code' => 'LIMS.SERVER.ERROR',
                'message' => "Missing DB column for action '{$action}'.",
            ], 500);
        }

        // Guard: prerequisites must exist (and columns must exist)
        foreach ($steps[$action]['requires'] as $reqKey) {
            $reqCol = $resolved[$reqKey] ?? null;
            if (!$reqCol) {
                return response()->json([
                    'status' => 500,
                    'code' => 'LIMS.SERVER.ERROR',
                    'message' => "Missing DB column prerequisite for '{$reqKey}'.",
                ], 500);
            }

            if (empty($sample->{$reqCol})) {
                return response()->json([
                    'status' => 422,
                    'code' => 'LIMS.VALIDATION.FIELDS_INVALID',
                    'message' => "You cannot perform '{$action}' before '{$reqCol}' is set.",
                    'details' => [
                        ['field' => 'action', 'message' => "Missing prerequisite: {$reqCol}"],
                    ],
                ], 422);
            }
        }

        // Guard: do not set twice
        if (!empty($sample->{$targetCol})) {
            return response()->json([
                'status' => 409,
                'code' => 'LIMS.RESOURCE.CONFLICT',
                'message' => "This step has already been recorded.",
                'details' => [
                    ['field' => 'action', 'message' => "{$targetCol} already set."],
                ],
            ], 409);
        }

        $old = $sample->{$targetCol};

        DB::transaction(function () use ($sample, $targetCol, $note, $actor, $action, $old) {
            $sample->{$targetCol} = now();

            if ($action === 'admin_brought_to_collector') {
                $sample->request_status = SampleRequestStatus::IN_TRANSIT_TO_COLLECTOR->value;
            }

            if ($action === 'collector_received') {
                $sample->request_status = SampleRequestStatus::UNDER_INSPECTION->value;
            }

            $sample->save();

            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));
                $staffId = $actor->staff_id ?? $actor->getKey();

                $payload = [
                    'staff_id' => $staffId,
                    'performed_by' => $staffId,
                    'user_id' => $staffId,
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => 'SAMPLE_PHYSICAL_WORKFLOW_CHANGED',

                    'performed_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),

                    'note' => $note,
                    'meta' => $note ? json_encode(['note' => $note]) : null,

                    'old_values' => json_encode([
                        $targetCol => $old,
                        'request_status' => $sample->getOriginal('request_status'),
                    ]),
                    'new_values' => json_encode([
                        $targetCol => $sample->{$targetCol},
                        'action' => $action,
                        'request_status' => $sample->request_status,
                    ]),
                ];

                $insert = array_intersect_key($payload, $cols);

                if (isset($cols['staff_id']) && empty($insert['staff_id'])) {
                    $insert['staff_id'] = $staffId;
                }

                DB::table('audit_logs')->insert($insert);
            }
        });

        $sample->refresh();

        return response()->json([
            'message' => 'Physical workflow timestamp recorded.',
            'data' => [
                'sample_id' => $sample->sample_id,
                'request_status' => $sample->request_status ?? null,

                // Return all known columns (only those that exist will be non-null)
                'admin_received_from_client_at' => $sample->admin_received_from_client_at ?? null,
                'admin_brought_to_collector_at' => $sample->admin_brought_to_collector_at ?? null,
                'admin_handed_to_collector_at' => $sample->admin_handed_to_collector_at ?? null,

                'collector_received_at' => $sample->collector_received_at ?? null,
                'collector_intake_completed_at' => $sample->collector_intake_completed_at ?? null,
                'collector_completed_at' => $sample->collector_completed_at ?? null,

                'collector_returned_to_admin_at' => $sample->collector_returned_to_admin_at ?? null,
                'admin_received_from_collector_at' => $sample->admin_received_from_collector_at ?? null,
                'client_picked_up_at' => $sample->client_picked_up_at ?? null,
            ],
        ], 200);
    }
}