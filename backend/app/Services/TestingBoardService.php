<?php

namespace App\Services;

use App\Models\Sample;
use App\Models\TestingBoard;
use App\Models\TestingColumn;
use App\Models\TestingCardEvent;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TestingBoardService
{
    public function __construct(
        private readonly WorkflowGroupResolver $workflowGroupResolver
    ) {}

    /**
     * Move a sample card to another testing column.
     *
     * - Validates target column belongs to the sample's workflow group's board
     * - Closes previous open event (if exited_at exists)
     * - Inserts new movement event
     * - Best-effort updates samples.testing_column_id if the column exists
     */
    public function moveCard(int $sampleId, int $toColumnId, int $actorStaffId): array
    {
        return DB::transaction(function () use ($sampleId, $toColumnId, $actorStaffId) {
            /** @var Sample $sample */
            $sample = Sample::query()->lockForUpdate()->findOrFail($sampleId);

            // 1) Extract parameter IDs from sample payload
            $parameterIds = $this->extractParameterIdsFromSample($sample);

            // 2) Resolve workflow group (via Services adapter -> Support resolver)
            $groupEnum = $this->workflowGroupResolver->resolveFromParameterIds($parameterIds);
            if (!$groupEnum) {
                abort(422, 'Cannot resolve workflow group from sample parameters.');
            }
            $workflowGroup = $groupEnum->value;

            // 3) Find board for resolved group
            /** @var TestingBoard|null $board */
            $board = TestingBoard::query()
                ->where('workflow_group', $workflowGroup)
                ->first();

            if (!$board) {
                abort(422, "Testing board not found for workflow_group: {$workflowGroup}");
            }

            // 4) Target column must belong to that board
            /** @var TestingColumn $toColumn */
            $toColumn = TestingColumn::query()->findOrFail($toColumnId);

            if ((int) $toColumn->board_id !== (int) $board->board_id) {
                abort(422, 'Target column does not belong to the resolved workflow group board.');
            }

            $now = Carbon::now();

            // 5) Determine from_column_id (best effort)
            $fromColumnId = null;

            // Prefer cached value on samples if it exists
            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $fromColumnId = $sample->getAttribute('testing_column_id');
            }

            // Fallback: last move event's to_column_id
            if (!$fromColumnId) {
                $latest = TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->orderByDesc('event_id')
                    ->first();

                if ($latest) {
                    $fromColumnId = $latest->to_column_id ?? null;
                }
            }

            // 6) Close previous open event if schema supports exited_at
            if (Schema::hasColumn('testing_card_events', 'exited_at')) {
                TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->whereNull('exited_at')
                    ->orderByDesc('event_id')
                    ->limit(1)
                    ->update(['exited_at' => $now]);
            }

            // 7) Insert new movement event
            $eventData = [
                'board_id' => (int) $board->board_id,
                'sample_id' => (int) $sampleId,
                'from_column_id' => $fromColumnId ? (int) $fromColumnId : null,
                'to_column_id' => (int) $toColumnId,
                'moved_by_staff_id' => (int) $actorStaffId,
                'moved_at' => $now,
            ];

            // Optional extra timestamp columns if you later add them (not required by step 10.1)
            if (Schema::hasColumn('testing_card_events', 'entered_at')) {
                $eventData['entered_at'] = $now;
            }

            /** @var TestingCardEvent $created */
            $created = TestingCardEvent::query()->create($eventData);

            // 8) Cache current column on sample (optional, only if schema exists)
            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $sample->setAttribute('testing_column_id', (int) $toColumnId);
                $sample->save();
            }

            return [
                'sample_id' => (int) $sampleId,
                'workflow_group' => $workflowGroup,
                'board_id' => (int) $board->board_id,
                'from_column_id' => $fromColumnId ? (int) $fromColumnId : null,
                'to_column_id' => (int) $toColumnId,
                'event_id' => (int) $created->event_id,
                'moved_at' => $now->toISOString(),
            ];
        });
    }

    /**
     * Best-effort extract parameter IDs from Sample model.
     *
     * Supports several shapes:
     * - requested_parameter_ids: [1,2,3]
     * - requested_parameters: [{parameter_id:1}, ...]
     * - parameters: [1,2] OR [{parameter_id:1}, ...]
     *
     * @return array<int, int|string|null>
     */
    private function extractParameterIdsFromSample(Sample $sample): array
    {
        $candidates = [
            $sample->getAttribute('requested_parameter_ids'),
            $sample->getAttribute('requested_parameters'),
            $sample->getAttribute('parameters'),
        ];

        foreach ($candidates as $val) {
            if (!$val) continue;

            // JSON string -> decode to array
            if (is_string($val)) {
                $decoded = json_decode($val, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $val = $decoded;
                }
            }

            if (!is_array($val)) continue;

            $out = [];
            foreach ($val as $row) {
                // row can be scalar id
                if (is_int($row) || is_string($row)) {
                    $out[] = $row;
                    continue;
                }

                // row can be array with parameter_id
                if (is_array($row) && array_key_exists('parameter_id', $row)) {
                    $out[] = $row['parameter_id'];
                    continue;
                }
            }

            if (count($out) > 0) return $out;
        }

        return [];
    }
}
