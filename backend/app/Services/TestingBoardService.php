<?php

namespace App\Services;

use App\Enums\WorkflowGroup;
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
        private readonly WorkflowGroupResolver $workflowGroupResolver,
    ) {}

    /**
     * Move a sample card to another testing column.
     * - closes previous "open" event (set exited_at)
     * - creates new event (entered_at)
     * - best-effort updates samples.testing_column_id if exists
     */
    public function moveCard(int $sampleId, int $toColumnId, int $actorStaffId): array
    {
        return DB::transaction(function () use ($sampleId, $toColumnId, $actorStaffId) {
            /** @var Sample $sample */
            $sample = Sample::query()->lockForUpdate()->findOrFail($sampleId);

            // Determine workflow group for sample (source-of-truth = resolver)
            $groupValue = $this->workflowGroupResolver->resolveForSample($sample);
            // allow resolver return string/enum; normalize
            $workflowGroup = $groupValue instanceof WorkflowGroup
                ? $groupValue->value
                : (string) $groupValue;

            /** @var TestingBoard|null $board */
            $board = TestingBoard::query()
                ->where('workflow_group', $workflowGroup)
                ->first();

            if (!$board) {
                abort(422, "Testing board not found for workflow_group: {$workflowGroup}");
            }

            /** @var TestingColumn $toColumn */
            $toColumn = TestingColumn::query()->findOrFail($toColumnId);

            if ((int) $toColumn->testing_board_id !== (int) $board->id) {
                abort(422, 'Target column does not belong to the resolved workflow group board.');
            }

            $now = Carbon::now();

            // Find current column (best effort)
            $fromColumnId = null;

            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $fromColumnId = $sample->getAttribute('testing_column_id');
            }

            if (!$fromColumnId) {
                // fallback from latest event
                $latest = TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->orderByDesc('id')
                    ->first();

                // try common field names
                if ($latest) {
                    $fromColumnId = $latest->to_column_id ?? $latest->testing_column_id ?? null;
                }
            }

            // Close previous open event if schema supports exited_at
            if (Schema::hasColumn('testing_card_events', 'exited_at')) {
                TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->whereNull('exited_at')
                    ->orderByDesc('id')
                    ->limit(1)
                    ->update(['exited_at' => $now]);
            }

            // Create new event (support multiple possible schemas)
            $eventData = [
                'sample_id' => $sampleId,
                'moved_by_staff_id' => $actorStaffId,
            ];

            if (Schema::hasColumn('testing_card_events', 'testing_board_id')) {
                $eventData['testing_board_id'] = (int) $board->id;
            }

            if (Schema::hasColumn('testing_card_events', 'from_column_id')) {
                $eventData['from_column_id'] = $fromColumnId ? (int) $fromColumnId : null;
            }

            if (Schema::hasColumn('testing_card_events', 'to_column_id')) {
                $eventData['to_column_id'] = (int) $toColumnId;
            } elseif (Schema::hasColumn('testing_card_events', 'testing_column_id')) {
                $eventData['testing_column_id'] = (int) $toColumnId;
            }

            if (Schema::hasColumn('testing_card_events', 'moved_at')) {
                $eventData['moved_at'] = $now;
            }

            if (Schema::hasColumn('testing_card_events', 'entered_at')) {
                $eventData['entered_at'] = $now;
            }

            /** @var TestingCardEvent $created */
            $created = TestingCardEvent::query()->create($eventData);

            // Keep snapshot of current column on samples (optional)
            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $sample->setAttribute('testing_column_id', (int) $toColumnId);
                $sample->save();
            }

            return [
                'sample_id' => $sampleId,
                'workflow_group' => $workflowGroup,
                'testing_board_id' => (int) $board->id,
                'from_column_id' => $fromColumnId ? (int) $fromColumnId : null,
                'to_column_id' => (int) $toColumnId,
                'event_id' => (int) $created->id,
                'moved_at' => $now->toISOString(),
            ];
        });
    }
}
