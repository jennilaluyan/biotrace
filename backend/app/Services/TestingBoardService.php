<?php

namespace App\Services;

use App\Models\Sample;
use App\Models\TestingBoard;
use App\Models\TestingCardEvent;
use App\Models\TestingColumn;
use App\Support\AuditLogger;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TestingBoardService
{
    public function __construct(
        private readonly WorkflowGroupResolver $workflowGroupResolver
    ) {}

    public function moveCard(
        int $sampleId,
        int $toColumnId,
        int $actorStaffId,
        ?string $workflowGroupOverride = null,
        bool $finalize = false,
        bool $applyToBatch = false
    ): array {
        return DB::transaction(function () use (
            $sampleId,
            $toColumnId,
            $actorStaffId,
            $workflowGroupOverride,
            $finalize,
            $applyToBatch
        ) {
            /** @var Sample $anchor */
            $anchor = Sample::query()->lockForUpdate()->findOrFail($sampleId);

            /** @var TestingColumn $toColumn */
            $toColumn = TestingColumn::query()->findOrFail($toColumnId);

            $targets = Sample::query();

            if (
                $applyToBatch &&
                Schema::hasColumn('samples', 'request_batch_id') &&
                !empty($anchor->request_batch_id)
            ) {
                $targets
                    ->where('client_id', $anchor->client_id)
                    ->where('request_batch_id', $anchor->request_batch_id);

                if (Schema::hasColumn('samples', 'batch_excluded_at')) {
                    $targets->whereNull('batch_excluded_at');
                }

                $targets = $targets
                    ->orderBy('request_batch_item_no')
                    ->orderBy('sample_id')
                    ->lockForUpdate()
                    ->get();
            } else {
                $targets = $targets
                    ->whereKey($anchor->getKey())
                    ->lockForUpdate()
                    ->get();
            }

            $moved = [];

            foreach ($targets as $sample) {
                $moved[] = $this->moveSingleSample(
                    $sample,
                    $toColumn,
                    $actorStaffId,
                    $workflowGroupOverride,
                    $finalize
                );
            }

            return [
                'sample_id' => (int) $anchor->sample_id,
                'request_batch_id' => $anchor->request_batch_id ?? null,
                'affected_sample_ids' => collect($moved)->pluck('sample_id')->values()->all(),
                'moves' => $moved,
                'finalized' => $finalize,
            ];
        });
    }

    public function getBoardCards(int $boardId): array
    {
        $columns = TestingColumn::query()
            ->where('board_id', $boardId)
            ->get(['column_id', 'position']);

        $columnIds = $columns->pluck('column_id')->map(fn($v) => (int) $v)->values()->all();
        if (!$columnIds) {
            return [];
        }

        if (Schema::hasColumn('samples', 'testing_column_id')) {
            $rows = Sample::query()
                ->whereIn('testing_column_id', $columnIds)
                ->get(['sample_id', 'testing_column_id', 'lab_sample_code', 'workflow_group']);

            $sampleIds = $rows->pluck('sample_id')->map(fn($v) => (int) $v)->values()->all();

            $eventsBySample = collect();

            if ($sampleIds && Schema::hasTable('testing_card_events')) {
                $cols = ['event_id', 'sample_id', 'to_column_id', 'from_column_id'];

                if (Schema::hasColumn('testing_card_events', 'moved_at')) {
                    $cols[] = 'moved_at';
                }
                if (Schema::hasColumn('testing_card_events', 'entered_at')) {
                    $cols[] = 'entered_at';
                }
                if (Schema::hasColumn('testing_card_events', 'exited_at')) {
                    $cols[] = 'exited_at';
                }
                if (Schema::hasColumn('testing_card_events', 'created_at')) {
                    $cols[] = 'created_at';
                }

                $eventsBySample = TestingCardEvent::query()
                    ->where('board_id', (int) $boardId)
                    ->whereIn('sample_id', $sampleIds)
                    ->orderByDesc($this->testingEventOrderColumn())
                    ->orderByDesc('event_id')
                    ->get($cols)
                    ->groupBy('sample_id')
                    ->map(fn($group) => $group->first());
            }

            return $rows->map(function ($sample) use ($eventsBySample) {
                $event = $eventsBySample->get((int) $sample->sample_id);
                $movedAt = $event?->moved_at ?? ($event?->created_at ?? null);

                return [
                    'sample_id' => (int) $sample->sample_id,
                    'column_id' => (int) $sample->testing_column_id,
                    'lab_sample_code' => $sample->lab_sample_code,
                    'workflow_group' => $sample->workflow_group,
                    'event_id' => $event?->event_id ? (int) $event->event_id : null,
                    'entered_at' => $event?->entered_at ?? null,
                    'moved_at' => $movedAt,
                    'exited_at' => $event?->exited_at ?? null,
                ];
            })->values()->all();
        }

        if (!Schema::hasTable('testing_card_events')) {
            return [];
        }

        $select = ['event_id', 'sample_id', 'to_column_id', 'from_column_id'];

        if (Schema::hasColumn('testing_card_events', 'moved_at')) {
            $select[] = 'moved_at';
        }
        if (Schema::hasColumn('testing_card_events', 'entered_at')) {
            $select[] = 'entered_at';
        }
        if (Schema::hasColumn('testing_card_events', 'exited_at')) {
            $select[] = 'exited_at';
        }
        if (Schema::hasColumn('testing_card_events', 'created_at')) {
            $select[] = 'created_at';
        }

        $latestEvents = TestingCardEvent::query()
            ->select($select)
            ->where('board_id', (int) $boardId)
            ->whereIn('to_column_id', $columnIds)
            ->orderByDesc($this->testingEventOrderColumn())
            ->orderByDesc('event_id')
            ->get()
            ->groupBy('sample_id')
            ->map(fn($group) => $group->first());

        if ($latestEvents->isEmpty()) {
            return [];
        }

        $sampleIds = $latestEvents->keys()->map(fn($v) => (int) $v)->values()->all();

        $samples = Sample::query()
            ->whereIn('sample_id', $sampleIds)
            ->get(['sample_id', 'lab_sample_code', 'workflow_group'])
            ->keyBy('sample_id');

        return $latestEvents->values()->map(function ($event) use ($samples) {
            $sample = $samples->get((int) $event->sample_id);
            $movedAt = $event?->moved_at ?? ($event?->created_at ?? null);

            return [
                'sample_id' => (int) $event->sample_id,
                'column_id' => (int) $event->to_column_id,
                'lab_sample_code' => $sample?->lab_sample_code,
                'workflow_group' => $sample?->workflow_group,
                'event_id' => $event?->event_id ? (int) $event->event_id : null,
                'entered_at' => $event?->entered_at ?? null,
                'moved_at' => $movedAt,
                'exited_at' => $event?->exited_at ?? null,
            ];
        })->values()->all();
    }

    public function getSampleTimeline(int $boardId, int $sampleId): array
    {
        if (!Schema::hasTable('testing_card_events')) {
            return [];
        }

        $cols = ['event_id', 'sample_id', 'from_column_id', 'to_column_id'];

        if (Schema::hasColumn('testing_card_events', 'moved_at')) {
            $cols[] = 'moved_at';
        }
        if (Schema::hasColumn('testing_card_events', 'entered_at')) {
            $cols[] = 'entered_at';
        }
        if (Schema::hasColumn('testing_card_events', 'exited_at')) {
            $cols[] = 'exited_at';
        }
        if (Schema::hasColumn('testing_card_events', 'created_at')) {
            $cols[] = 'created_at';
        }

        return TestingCardEvent::query()
            ->where('board_id', (int) $boardId)
            ->where('sample_id', (int) $sampleId)
            ->orderBy($this->testingEventOrderColumn(), 'asc')
            ->orderBy('event_id', 'asc')
            ->get($cols)
            ->map(function ($event) {
                $movedAt = $event->moved_at ?? ($event->created_at ?? null);

                return [
                    'event_id' => (int) ($event->event_id ?? $event->getKey()),
                    'sample_id' => (int) $event->sample_id,
                    'from_column_id' => $event->from_column_id !== null ? (int) $event->from_column_id : null,
                    'to_column_id' => $event->to_column_id !== null ? (int) $event->to_column_id : null,
                    'moved_at' => $movedAt,
                    'entered_at' => $event->entered_at ?? null,
                    'exited_at' => $event->exited_at ?? null,
                ];
            })
            ->values()
            ->all();
    }

    private function moveSingleSample(
        Sample $sample,
        TestingColumn $toColumn,
        int $actorStaffId,
        ?string $workflowGroupOverride,
        bool $finalize
    ): array {
        $workflowGroup = $this->resolveWorkflowGroup($sample, $workflowGroupOverride, $actorStaffId);

        /** @var TestingBoard $board */
        $board = $this->findOrCreateBoard($workflowGroup);

        if ((int) $toColumn->board_id !== (int) $board->board_id) {
            abort(422, "Target column does not belong to the resolved workflow group board for sample {$sample->sample_id}.");
        }

        $now = Carbon::now();
        $fromColumnId = $this->resolveCurrentColumnId($sample);
        $fromColumnName = $fromColumnId !== null ? $this->resolveColumnName($fromColumnId) : null;
        $toColumnName = $toColumn->name ?? null;

        $lastColumn = TestingColumn::query()
            ->where('board_id', (int) $board->board_id)
            ->orderByDesc('position')
            ->first();

        $lastColumnId = (int) ($lastColumn?->column_id ?? 0);
        $isAtLast = $lastColumnId > 0 && (int) $toColumn->column_id === $lastColumnId;
        $isFinalizeCall = $finalize
            && $isAtLast
            && $fromColumnId !== null
            && (int) $fromColumnId === (int) $toColumn->column_id;

        if ($isFinalizeCall) {
            $eventId = $this->finalizeSampleStage($sample, $now);

            $this->unlockQualityCoverIfNeeded(
                $sample,
                $now,
                $actorStaffId,
                (int) $board->board_id,
                (int) $toColumn->column_id,
                $workflowGroup
            );

            $this->markTestingDoneIfNeeded($sample, $now);

            AuditLogger::logTestingStageMoved(
                staffId: (int) $actorStaffId,
                sampleId: (int) $sample->sample_id,
                workflowGroup: (string) $workflowGroup,
                boardId: (int) $board->board_id,
                fromColumnId: $fromColumnId !== null ? (int) $fromColumnId : null,
                fromColumnName: $fromColumnName ? (string) $fromColumnName : null,
                toColumnId: (int) $toColumn->column_id,
                toColumnName: $toColumnName ? (string) $toColumnName : null,
                eventId: $eventId,
                note: $eventId !== null ? 'finalized_last_stage' : 'finalize_no_event_updated'
            );

            return [
                'sample_id' => (int) $sample->sample_id,
                'workflow_group' => (string) $workflowGroup,
                'board_id' => (int) $board->board_id,
                'from_column_id' => $fromColumnId !== null ? (int) $fromColumnId : null,
                'to_column_id' => (int) $toColumn->column_id,
                'event_id' => $eventId,
                'moved_at' => $now->toISOString(),
                'finalized' => true,
            ];
        }

        $this->closePreviousOpenStage((int) $sample->sample_id, $now);

        $eventData = [
            'board_id' => (int) $board->board_id,
            'sample_id' => (int) $sample->sample_id,
            'from_column_id' => $fromColumnId !== null ? (int) $fromColumnId : null,
            'to_column_id' => (int) $toColumn->column_id,
            'moved_by_staff_id' => (int) $actorStaffId,
        ];

        if (Schema::hasColumn('testing_card_events', 'moved_at')) {
            $eventData['moved_at'] = $now;
        }

        if (Schema::hasColumn('testing_card_events', 'entered_at')) {
            $eventData['entered_at'] = $now;
        }

        /** @var TestingCardEvent $created */
        $created = TestingCardEvent::query()->create($eventData);

        if (Schema::hasColumn('samples', 'testing_column_id')) {
            $sample->setAttribute('testing_column_id', (int) $toColumn->column_id);
            $sample->save();
        }

        $eventId = (int) ($created->event_id ?? $created->getKey());

        if ($isAtLast) {
            $this->unlockQualityCoverIfNeeded(
                $sample,
                $now,
                $actorStaffId,
                (int) $board->board_id,
                (int) $toColumn->column_id,
                $workflowGroup
            );
        }

        AuditLogger::logTestingStageMoved(
            staffId: (int) $actorStaffId,
            sampleId: (int) $sample->sample_id,
            workflowGroup: (string) $workflowGroup,
            boardId: (int) $board->board_id,
            fromColumnId: $fromColumnId !== null ? (int) $fromColumnId : null,
            fromColumnName: $fromColumnName ? (string) $fromColumnName : null,
            toColumnId: (int) $toColumn->column_id,
            toColumnName: $toColumnName ? (string) $toColumnName : null,
            eventId: $eventId,
            note: $created->note ?? null
        );

        return [
            'sample_id' => (int) $sample->sample_id,
            'workflow_group' => (string) $workflowGroup,
            'board_id' => (int) $board->board_id,
            'from_column_id' => $fromColumnId !== null ? (int) $fromColumnId : null,
            'to_column_id' => (int) $toColumn->column_id,
            'event_id' => $eventId,
            'moved_at' => $now->toISOString(),
            'finalized' => false,
        ];
    }

    private function resolveWorkflowGroup(
        Sample $sample,
        ?string $workflowGroupOverride,
        int $actorStaffId
    ): string {
        $workflowGroup = null;

        if ($workflowGroupOverride) {
            $workflowGroup = trim((string) $workflowGroupOverride);
        } else {
            $parameterIds = $this->extractParameterIdsFromSample($sample);
            $groupEnum = $this->workflowGroupResolver->resolveFromParameterIds($parameterIds);

            if (!$groupEnum) {
                abort(422, "Cannot resolve workflow group from sample parameters for sample {$sample->sample_id}.");
            }

            $workflowGroup = is_object($groupEnum) && property_exists($groupEnum, 'value')
                ? (string) $groupEnum->value
                : (string) $groupEnum;
        }

        if (!$workflowGroup) {
            abort(422, 'Workflow group is empty.');
        }

        $this->syncWorkflowGroupOnSample($sample, $workflowGroup, $actorStaffId);

        return $workflowGroup;
    }

    private function syncWorkflowGroupOnSample(Sample $sample, string $workflowGroup, int $actorStaffId): void
    {
        if (!Schema::hasColumn('samples', 'workflow_group')) {
            return;
        }

        $oldGroup = $sample->getAttribute('workflow_group');
        $oldGroupNorm = $oldGroup !== null ? trim((string) $oldGroup) : null;
        $newGroupNorm = trim((string) $workflowGroup);

        if ($newGroupNorm === '' || $oldGroupNorm === $newGroupNorm) {
            return;
        }

        $sample->setAttribute('workflow_group', $newGroupNorm);
        $sample->save();

        if (!method_exists(AuditLogger::class, 'logWorkflowGroupChanged')) {
            return;
        }

        try {
            $parameterIds = $this->extractParameterIdsFromSample($sample);

            AuditLogger::logWorkflowGroupChanged(
                staffId: (int) $actorStaffId,
                sampleId: (int) $sample->sample_id,
                clientId: (int) ($sample->client_id ?? 0),
                oldGroup: $oldGroupNorm,
                newGroup: $newGroupNorm,
                parameterIds: $parameterIds,
            );
        } catch (\Throwable) {
        }
    }

    private function findOrCreateBoard(string $workflowGroup): TestingBoard
    {
        $board = TestingBoard::query()
            ->where('workflow_group', $workflowGroup)
            ->first();

        if ($board) {
            return $board;
        }

        $board = TestingBoard::query()->create([
            'workflow_group' => $workflowGroup,
            'name' => strtoupper($workflowGroup) . ' Testing Board',
        ]);

        foreach (
            [
                ['name' => 'In Testing', 'position' => 1],
                ['name' => 'Measuring', 'position' => 2],
                ['name' => 'Ready for Review', 'position' => 3],
            ] as $default
        ) {
            TestingColumn::query()->create([
                'board_id' => (int) $board->board_id,
                'name' => $default['name'],
                'position' => (int) $default['position'],
            ]);
        }

        return $board->refresh();
    }

    private function resolveCurrentColumnId(Sample $sample): ?int
    {
        if (Schema::hasColumn('samples', 'testing_column_id')) {
            $raw = $sample->getAttribute('testing_column_id');
            if ($raw !== null) {
                return (int) $raw;
            }
        }

        $latest = TestingCardEvent::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->orderByDesc($this->testingEventOrderColumn())
            ->orderByDesc('event_id')
            ->first();

        return $latest?->to_column_id !== null ? (int) $latest->to_column_id : null;
    }

    private function resolveColumnName(?int $columnId): ?string
    {
        if ($columnId === null) {
            return null;
        }

        $column = TestingColumn::query()->find((int) $columnId);

        return $column?->name;
    }

    private function closePreviousOpenStage(int $sampleId, Carbon $now): void
    {
        if (!Schema::hasTable('testing_card_events') || !Schema::hasColumn('testing_card_events', 'exited_at')) {
            return;
        }

        TestingCardEvent::query()
            ->where('sample_id', $sampleId)
            ->whereNull('exited_at')
            ->orderByDesc($this->testingEventOrderColumn())
            ->orderByDesc('event_id')
            ->limit(1)
            ->update(['exited_at' => $now]);
    }

    private function finalizeSampleStage(Sample $sample, Carbon $now): ?int
    {
        if (!Schema::hasTable('testing_card_events') || !Schema::hasColumn('testing_card_events', 'exited_at')) {
            return null;
        }

        $query = TestingCardEvent::query()
            ->where('sample_id', (int) $sample->sample_id)
            ->orderByDesc($this->testingEventOrderColumn())
            ->orderByDesc('event_id');

        $open = (clone $query)->whereNull('exited_at')->first();
        $target = $open ?: $query->first();

        if (!$target) {
            return null;
        }

        $target->exited_at = $now;
        $target->save();

        return (int) ($target->event_id ?? $target->getKey());
    }

    private function unlockQualityCoverIfNeeded(
        Sample $sample,
        Carbon $now,
        int $actorStaffId,
        int $boardId,
        int $toColumnId,
        string $workflowGroup
    ): void {
        if (
            !Schema::hasColumn('samples', 'quality_cover_unlocked_at') ||
            $sample->getAttribute('quality_cover_unlocked_at')
        ) {
            return;
        }

        $sample->setAttribute('quality_cover_unlocked_at', $now);

        if (Schema::hasColumn('samples', 'quality_cover_unlocked_by_staff_id')) {
            $sample->setAttribute('quality_cover_unlocked_by_staff_id', (int) $actorStaffId);
        }

        $sample->save();

        AuditLogger::logQualityCoverUnlocked(
            (int) $actorStaffId,
            (int) $sample->sample_id,
            $boardId,
            $toColumnId,
            $workflowGroup
        );
    }

    private function markTestingDoneIfNeeded(Sample $sample, Carbon $now): void
    {
        $didSetDone = false;

        if (Schema::hasColumn('samples', 'testing_completed_at') && !$sample->getAttribute('testing_completed_at')) {
            $sample->setAttribute('testing_completed_at', $now);
            $didSetDone = true;
        }

        if (Schema::hasColumn('samples', 'testing_done_at') && !$sample->getAttribute('testing_done_at')) {
            $sample->setAttribute('testing_done_at', $now);
            $didSetDone = true;
        }

        if (Schema::hasColumn('samples', 'tests_completed_at') && !$sample->getAttribute('tests_completed_at')) {
            $sample->setAttribute('tests_completed_at', $now);
            $didSetDone = true;
        }

        if ($didSetDone) {
            $sample->save();
        }
    }

    private function testingEventOrderColumn(): string
    {
        return Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id';
    }

    private function extractParameterIdsFromSample(Sample $sample): array
    {
        $candidates = [
            $sample->getAttribute('requested_parameter_ids'),
            $sample->getAttribute('requested_parameters'),
            $sample->getAttribute('parameters'),
        ];

        foreach ($candidates as $value) {
            if (!$value) {
                continue;
            }

            if (is_string($value)) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $value = $decoded;
                }
            }

            if (!is_array($value)) {
                continue;
            }

            $out = [];

            foreach ($value as $row) {
                if (is_int($row) || is_string($row)) {
                    $out[] = $row;
                    continue;
                }

                if (is_array($row) && array_key_exists('parameter_id', $row)) {
                    $out[] = $row['parameter_id'];
                }
            }

            if (count($out) > 0) {
                $out = array_values(array_unique(array_map('intval', $out)));
                $out = array_values(array_filter($out, fn($v) => (int) $v > 0));
                return $out;
            }
        }

        $pivotOut = $this->extractParameterIdsFromRequestedPivot($sample);
        if (count($pivotOut) > 0) {
            return $pivotOut;
        }

        $dbOut = $this->extractParameterIdsFromDbFallback($sample);
        if (count($dbOut) > 0) {
            return $dbOut;
        }

        return [];
    }

    private function extractParameterIdsFromRequestedPivot(Sample $sample): array
    {
        $sampleId = (int) $sample->getKey();

        if (
            !Schema::hasTable('sample_requested_parameters') ||
            !Schema::hasColumn('sample_requested_parameters', 'sample_id') ||
            !Schema::hasColumn('sample_requested_parameters', 'parameter_id')
        ) {
            return [];
        }

        $rows = DB::table('sample_requested_parameters')
            ->where('sample_id', $sampleId)
            ->pluck('parameter_id')
            ->map(fn($v) => (int) $v)
            ->values()
            ->all();

        return array_values(array_unique(array_filter($rows, fn($v) => (int) $v > 0)));
    }

    private function extractParameterIdsFromDbFallback(Sample $sample): array
    {
        $sampleId = (int) $sample->getKey();
        $out = [];

        if (Schema::hasTable('sample_tests') && Schema::hasColumn('sample_tests', 'sample_id')) {
            $rows = DB::table('sample_tests')
                ->where('sample_id', $sampleId)
                ->get();

            foreach ($rows as $row) {
                if (property_exists($row, 'parameter_id') && $row->parameter_id !== null) {
                    $out[] = $row->parameter_id;
                }

                foreach (['parameter_ids', 'parameters'] as $jsonField) {
                    if (!property_exists($row, $jsonField)) {
                        continue;
                    }

                    $value = $row->{$jsonField};
                    if (!$value) {
                        continue;
                    }

                    if (is_string($value)) {
                        $decoded = json_decode($value, true);
                        if (json_last_error() === JSON_ERROR_NONE) {
                            $value = $decoded;
                        }
                    }

                    if (!is_array($value)) {
                        continue;
                    }

                    foreach ($value as $item) {
                        if (is_int($item) || is_string($item)) {
                            $out[] = $item;
                        }

                        if (is_array($item) && array_key_exists('parameter_id', $item)) {
                            $out[] = $item['parameter_id'];
                        }
                    }
                }
            }
        }

        if (
            Schema::hasTable('letter_of_order_items') &&
            Schema::hasColumn('letter_of_order_items', 'sample_id') &&
            Schema::hasColumn('letter_of_order_items', 'parameters')
        ) {
            $items = DB::table('letter_of_order_items')
                ->where('sample_id', $sampleId)
                ->get(['parameters']);

            foreach ($items as $item) {
                $value = $item->parameters ?? null;
                if (!$value) {
                    continue;
                }

                if (is_string($value)) {
                    $decoded = json_decode($value, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $value = $decoded;
                    }
                }

                if (!is_array($value)) {
                    continue;
                }

                foreach ($value as $parameter) {
                    if (is_int($parameter) || is_string($parameter)) {
                        $out[] = $parameter;
                    }

                    if (is_array($parameter) && array_key_exists('parameter_id', $parameter)) {
                        $out[] = $parameter['parameter_id'];
                    }
                }
            }
        }

        $out = array_values(array_unique(array_map('intval', $out)));
        $out = array_values(array_filter($out, fn($v) => (int) $v > 0));

        return $out;
    }
}
