<?php

namespace App\Http\Controllers;

use App\Enums\SampleRequestStatus;
use App\Http\Requests\SampleCustodyEventRequest;
use App\Http\Requests\SamplePhysicalWorkflowUpdateRequest;
use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SamplePhysicalWorkflowController extends Controller
{
    public function update(SamplePhysicalWorkflowUpdateRequest $request, Sample $sample): JsonResponse
    {
        $data = $request->validated();
        $action = $data['action'];
        $note = $data['note'] ?? null;
        $applyToBatch = filter_var((string) ($data['apply_to_batch'] ?? false), FILTER_VALIDATE_BOOLEAN);

        return $this->applyEvent($sample, $action, $note, $applyToBatch);
    }

    public function store(SampleCustodyEventRequest $request, Sample $sample): JsonResponse
    {
        $data = $request->validated();
        $action = $data['event_key'];
        $note = $data['note'] ?? null;

        return $this->applyEvent($sample, $action, $note);
    }

    public function scDelivered(Request $request, Sample $sample): JsonResponse
    {
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
            'apply_to_batch' => ['nullable', 'boolean'],
        ]);

        return $this->applyEvent(
            $sample,
            'sc_delivered_to_analyst',
            $data['note'] ?? null,
            (bool) ($data['apply_to_batch'] ?? false)
        );
    }

    public function analystReceived(Request $request, Sample $sample): JsonResponse
    {
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
            'apply_to_batch' => ['nullable', 'boolean'],
        ]);

        return $this->applyEvent(
            $sample,
            'analyst_received',
            $data['note'] ?? null,
            (bool) ($data['apply_to_batch'] ?? false)
        );
    }

    private function applyEvent(
        Sample $sample,
        string $action,
        ?string $note,
        bool $applyToBatch = false
    ): JsonResponse {
        /** @var mixed $actor */
        $actor = request()->user();

        if (!$actor instanceof Staff) {
            return response()->json([
                'status' => 403,
                'code' => 'LIMS.AUTH.FORBIDDEN',
                'message' => 'Forbidden.',
            ], 403);
        }

        $this->authorize('updatePhysicalWorkflow', [$sample, $action]);

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
            'sc_delivered_to_analyst' => [
                'col_candidates' => ['sc_delivered_to_analyst_at'],
                'requires' => ['collector_intake_completed'],
            ],
            'analyst_received' => [
                'col_candidates' => ['analyst_received_at'],
                'requires' => ['sc_delivered_to_analyst'],
            ],
            'analyst_returned_to_sc' => [
                'col_candidates' => ['analyst_returned_to_sc_at'],
                'requires' => ['analyst_received'],
            ],
            'sc_received_from_analyst' => [
                'col_candidates' => ['sc_received_from_analyst_at'],
                'requires' => ['analyst_returned_to_sc'],
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
            foreach ($candidates as $candidate) {
                if (Schema::hasColumn('samples', $candidate)) {
                    return $candidate;
                }
            }

            return null;
        };

        $resolved = [];
        foreach ($steps as $key => $config) {
            $resolved[$key] = $resolveCol($config['col_candidates']);
        }

        $targetCol = $resolved[$action] ?? null;
        if (!$targetCol) {
            return response()->json([
                'status' => 500,
                'code' => 'LIMS.SERVER.ERROR',
                'message' => "Missing DB column for action '{$action}'.",
            ], 500);
        }

        $affectedIds = [];
        $primary = null;

        DB::transaction(function () use (
            $sample,
            $applyToBatch,
            $action,
            $note,
            $actor,
            $steps,
            $resolved,
            $targetCol,
            &$affectedIds,
            &$primary
        ) {
            $targets = $this->resolvePhysicalTargets($sample, $applyToBatch);

            if ($targets->isEmpty()) {
                abort(404, 'Sample target not found.');
            }

            foreach ($targets as $row) {
                $this->authorize('updatePhysicalWorkflow', [$row, $action]);

                foreach ($steps[$action]['requires'] as $requiredKey) {
                    $requiredCol = $resolved[$requiredKey] ?? null;

                    if (!$requiredCol) {
                        abort(500, "Missing DB column prerequisite for '{$requiredKey}'.");
                    }

                    if ($action === 'analyst_returned_to_sc') {
                        $crosscheckStatus = strtolower((string) ($row->crosscheck_status ?? ''));
                        if ($crosscheckStatus !== 'failed') {
                            abort(422, "Cannot return sample {$row->sample_id} to Sample Collector unless crosscheck_status is failed.");
                        }
                    }

                    if (empty($row->{$requiredCol})) {
                        abort(422, "You cannot perform '{$action}' for sample {$row->sample_id} before '{$requiredCol}' is set.");
                    }
                }

                $requestStatus = (string) ($row->request_status ?? '');

                if (
                    $action === 'collector_received' &&
                    $requestStatus !== SampleRequestStatus::IN_TRANSIT_TO_COLLECTOR->value
                ) {
                    abort(422, "Collector can only receive sample {$row->sample_id} when status is in_transit_to_collector.");
                }

                if (
                    $action === 'collector_returned_to_admin' &&
                    $requestStatus !== SampleRequestStatus::INSPECTION_FAILED->value
                ) {
                    abort(422, "Collector can only return sample {$row->sample_id} to admin when status is inspection_failed.");
                }

                if (
                    $action === 'admin_received_from_collector' &&
                    !in_array($requestStatus, [
                        SampleRequestStatus::RETURNED_TO_ADMIN->value,
                        SampleRequestStatus::INSPECTION_FAILED->value,
                    ], true)
                ) {
                    abort(422, "Admin can only receive sample {$row->sample_id} from collector after inspection return flow.");
                }

                if (
                    $action === 'client_picked_up' &&
                    !in_array($requestStatus, [
                        'returned',
                        'rejected',
                        SampleRequestStatus::RETURNED_TO_ADMIN->value,
                    ], true)
                ) {
                    abort(422, "Client pickup can only be recorded for sample {$row->sample_id} after admin has closed the failed intake flow.");
                }

                if (!empty($row->{$targetCol})) {
                    abort(409, "This step has already been recorded for sample {$row->sample_id}.");
                }
            }

            $timestamp = now();
            $hasAuditLogsTable = Schema::hasTable('audit_logs');
            $auditColumns = $hasAuditLogsTable ? array_flip(Schema::getColumnListing('audit_logs')) : [];
            $staffId = $actor->staff_id ?? $actor->getKey();

            foreach ($targets as $row) {
                $oldTargetValue = $row->{$targetCol};
                $oldRequestStatus = (string) ($row->request_status ?? '');

                $row->{$targetCol} = $timestamp;

                if ($action === 'admin_brought_to_collector') {
                    $row->request_status = SampleRequestStatus::IN_TRANSIT_TO_COLLECTOR->value;
                }

                if ($action === 'collector_received') {
                    $row->request_status = SampleRequestStatus::UNDER_INSPECTION->value;
                }

                if ($action === 'collector_returned_to_admin') {
                    $row->request_status = SampleRequestStatus::RETURNED_TO_ADMIN->value;
                }

                if ($action === 'admin_received_from_collector') {
                    $row->request_status = SampleRequestStatus::RETURNED_TO_ADMIN->value;
                }

                if ($action === 'client_picked_up') {
                    if (Schema::hasColumn('samples', 'archived_at') && empty($row->archived_at)) {
                        $row->archived_at = $timestamp;
                    }
                }

                if ($action === 'sc_delivered_to_analyst') {
                    $row->request_status = SampleRequestStatus::IN_TRANSIT_TO_ANALYST->value;
                }

                if ($action === 'analyst_received') {
                    $row->request_status = SampleRequestStatus::RECEIVED_BY_ANALYST->value;
                }

                $row->save();

                if ($hasAuditLogsTable) {
                    $payload = [
                        'staff_id' => $staffId,
                        'performed_by' => $staffId,
                        'user_id' => $staffId,
                        'entity_name' => 'samples',
                        'entity_id' => $row->sample_id,
                        'action' => 'SAMPLE_PHYSICAL_WORKFLOW_CHANGED',
                        'performed_at' => $timestamp,
                        'created_at' => $timestamp,
                        'updated_at' => $timestamp,
                        'note' => $note,
                        'meta' => $note ? json_encode(['note' => $note]) : null,
                        'old_values' => json_encode([
                            $targetCol => $oldTargetValue,
                            'request_status' => $oldRequestStatus,
                        ]),
                        'new_values' => json_encode([
                            $targetCol => $row->{$targetCol},
                            'event_key' => $action,
                            'request_status' => $row->request_status,
                        ]),
                    ];

                    $insert = array_intersect_key($payload, $auditColumns);

                    if (isset($auditColumns['staff_id']) && empty($insert['staff_id'])) {
                        $insert['staff_id'] = $staffId;
                    }

                    DB::table('audit_logs')->insert($insert);
                }

                $affectedIds[] = (int) $row->sample_id;
                $primary ??= $row;
            }
        });

        $primary = $primary?->fresh();

        return response()->json([
            'message' => 'Physical workflow timestamp recorded.',
            'data' => [
                'sample_id' => $primary?->sample_id,
                'request_status' => $primary?->request_status ?? null,
                'request_batch_id' => $primary?->request_batch_id ?? null,
                'affected_sample_ids' => $affectedIds,
                'batch_total' => count($affectedIds),

                'admin_received_from_client_at' => $primary?->admin_received_from_client_at ?? null,
                'admin_brought_to_collector_at' => $primary?->admin_brought_to_collector_at ?? null,
                'admin_handed_to_collector_at' => $primary?->admin_handed_to_collector_at ?? null,

                'collector_received_at' => $primary?->collector_received_at ?? null,
                'collector_intake_completed_at' => $primary?->collector_intake_completed_at ?? null,
                'collector_completed_at' => $primary?->collector_completed_at ?? null,

                'collector_returned_to_admin_at' => $primary?->collector_returned_to_admin_at ?? null,
                'admin_received_from_collector_at' => $primary?->admin_received_from_collector_at ?? null,

                'sc_delivered_to_analyst_at' => $primary?->sc_delivered_to_analyst_at ?? null,
                'analyst_received_at' => $primary?->analyst_received_at ?? null,

                'client_picked_up_at' => $primary?->client_picked_up_at ?? null,
                'archived_at' => Schema::hasColumn('samples', 'archived_at') ? ($primary?->archived_at ?? null) : null,
            ],
        ], 200);
    }

    private function resolvePhysicalTargets(Sample $sample, bool $applyToBatch)
    {
        $query = Sample::query();

        if (
            $applyToBatch &&
            Schema::hasColumn('samples', 'request_batch_id') &&
            !empty($sample->request_batch_id)
        ) {
            $query
                ->where('client_id', $sample->client_id)
                ->where('request_batch_id', $sample->request_batch_id);

            if (Schema::hasColumn('samples', 'batch_excluded_at')) {
                $query->whereNull('batch_excluded_at');
            }

            return $query
                ->orderBy('request_batch_item_no')
                ->orderBy('sample_id')
                ->lockForUpdate()
                ->get();
        }

        return $query
            ->whereKey($sample->getKey())
            ->lockForUpdate()
            ->get();
    }
}
