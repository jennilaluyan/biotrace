<?php

namespace App\Services;

use App\Models\Sample;
use App\Models\TestingBoard;
use App\Models\TestingColumn;
use App\Models\TestingCardEvent;
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
        ?string $workflowGroupOverride = null
    ): array {
        return DB::transaction(function () use ($sampleId, $toColumnId, $actorStaffId, $workflowGroupOverride) {
            /** @var Sample $sample */
            $sample = Sample::query()->lockForUpdate()->findOrFail($sampleId);

            // 1) Resolve workflow group (override wins)
            $workflowGroup = null;

            if ($workflowGroupOverride) {
                $workflowGroup = trim((string) $workflowGroupOverride);
            } else {
                $parameterIds = $this->extractParameterIdsFromSample($sample);

                $groupEnum = $this->workflowGroupResolver->resolveFromParameterIds($parameterIds);
                if (!$groupEnum) {
                    abort(422, 'Cannot resolve workflow group from sample parameters.');
                }

                $workflowGroup = is_object($groupEnum) && property_exists($groupEnum, 'value')
                    ? (string) $groupEnum->value
                    : (string) $groupEnum;
            }

            if (!$workflowGroup) {
                abort(422, 'Workflow group is empty.');
            }

            // 2) Find (or create) board for that group
            /** @var TestingBoard|null $board */
            $board = TestingBoard::query()
                ->where('workflow_group', $workflowGroup)
                ->first();

            if (!$board) {
                $board = TestingBoard::query()->create([
                    'workflow_group' => $workflowGroup,
                    'name' => strtoupper($workflowGroup) . ' Testing Board',
                ]);

                $defaults = [
                    ['name' => 'In Testing', 'position' => 1],
                    ['name' => 'Measuring', 'position' => 2],
                    ['name' => 'Ready for Review', 'position' => 3],
                ];

                foreach ($defaults as $d) {
                    TestingColumn::query()->create([
                        'board_id' => (int) $board->board_id,
                        'name' => $d['name'],
                        'position' => (int) $d['position'],
                    ]);
                }

                $board->refresh();
            }

            // 3) Target column must belong to that board
            /** @var TestingColumn $toColumn */
            $toColumn = TestingColumn::query()->findOrFail($toColumnId);

            if ((int) $toColumn->board_id !== (int) $board->board_id) {
                abort(422, 'Target column does not belong to the resolved workflow group board.');
            }

            $now = Carbon::now();

            // ✅ Find current column (best effort) - ensure always initialized
            $fromColumnId = null;

            // Prefer persisted column on samples
            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $raw = $sample->getAttribute('testing_column_id');
                $fromColumnId = $raw !== null ? (int) $raw : null;
            }

            // Fallback to latest card event
            if ($fromColumnId === null) {
                $latest = TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->orderByDesc('moved_at')
                    ->orderByDesc('event_id')
                    ->first();

                $fromColumnId = $latest?->to_column_id !== null ? (int) $latest->to_column_id : null;
            }

            // Resolve from/to column names (best effort)
            $fromColName = null;
            if ($fromColumnId !== null) {
                $fromCol = TestingColumn::query()->find((int) $fromColumnId);
                $fromColName = $fromCol?->name;
            }
            $toColName = $toColumn->name ?? null;

            // Close previous stage (if your schema supports it)
            if (Schema::hasColumn('testing_card_events', 'exited_at')) {
                TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->whereNull('exited_at')
                    ->orderByDesc('moved_at')
                    ->orderByDesc('event_id')
                    ->limit(1)
                    ->update(['exited_at' => $now]);
            }

            // Create movement event
            $eventData = [
                'board_id' => (int) $board->board_id,
                'sample_id' => (int) $sampleId,
                'from_column_id' => $fromColumnId !== null ? (int) $fromColumnId : null,
                'to_column_id' => (int) $toColumnId,
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

            // ✅ Persist current column to samples (prevents "lost progress" on reload)
            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $sample->setAttribute('testing_column_id', (int) $toColumnId);
                $sample->save();
            }

            $eventId = (int) ($created->event_id ?? $created->getKey());

            // ✅ QC unlock gate: unlock when reaching last column (only once)
            $lastColumn = TestingColumn::query()
                ->where('board_id', (int) $board->board_id)
                ->orderByDesc('position')
                ->first();

            $lastColumnId = (int) ($lastColumn?->column_id ?? 0);

            if ($lastColumnId > 0 && (int) $toColumnId === $lastColumnId) {
                if (
                    Schema::hasColumn('samples', 'quality_cover_unlocked_at') &&
                    !$sample->getAttribute('quality_cover_unlocked_at')
                ) {
                    $sample->setAttribute('quality_cover_unlocked_at', $now);

                    if (Schema::hasColumn('samples', 'quality_cover_unlocked_by_staff_id')) {
                        $sample->setAttribute('quality_cover_unlocked_by_staff_id', (int) $actorStaffId);
                    }

                    $sample->save();

                    // Avoid named arguments to prevent signature mismatch warnings
                    AuditLogger::logQualityCoverUnlocked(
                        (int) $actorStaffId,
                        (int) $sample->sample_id,
                        (int) $board->board_id,
                        (int) $toColumnId,
                        (string) $workflowGroup
                    );
                }
            }

            // ✅ Step 10.6 — audit log (existing)
            AuditLogger::logTestingStageMoved(
                staffId: (int) $actorStaffId,
                sampleId: (int) $sampleId,
                workflowGroup: (string) $workflowGroup,
                boardId: (int) $board->board_id,
                fromColumnId: $fromColumnId !== null ? (int) $fromColumnId : null,
                fromColumnName: $fromColName ? (string) $fromColName : null,
                toColumnId: (int) $toColumnId,
                toColumnName: $toColName ? (string) $toColName : null,
                eventId: $eventId,
                note: $created->note ?? null
            );

            return [
                'sample_id' => (int) $sampleId,
                'workflow_group' => (string) $workflowGroup,
                'board_id' => (int) $board->board_id,
                'from_column_id' => $fromColumnId !== null ? (int) $fromColumnId : null,
                'to_column_id' => (int) $toColumnId,
                'event_id' => $eventId,
                'moved_at' => $now->toISOString(),
            ];
        });
    }

    /**
     * Add a new column to a workflow group board (with safe position shifting).
     */
    public function addColumn(string $workflowGroup, string $name, int $position): array
    {
        return DB::transaction(function () use ($workflowGroup, $name, $position) {
            /** @var TestingBoard|null $board */
            $board = TestingBoard::query()
                ->where('workflow_group', $workflowGroup)
                ->first();

            if (!$board) {
                abort(422, "Testing board not found for workflow_group: {$workflowGroup}");
            }

            $position = max(1, (int) $position);

            $maxPos = (int) TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->max('position');

            // clamp position (allow append)
            if ($maxPos > 0) {
                $position = min($position, $maxPos + 1);
            }

            // Safe shift to prevent unique(board_id, position) collision
            // Step A: move affected positions out of the way
            TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->where('position', '>=', $position)
                ->update(['position' => DB::raw('position + 1000')]);

            // Step B: bring them back with +1 net shift
            TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->where('position', '>=', $position + 1000)
                ->update(['position' => DB::raw('position - 999')]); // (pos+1000) - 999 = pos+1

            /** @var TestingColumn $col */
            $col = TestingColumn::query()->create([
                'board_id' => (int) $board->board_id,
                'name' => $name,
                'position' => $position,
            ]);

            return [
                'column_id' => (int) ($col->column_id ?? $col->getKey()),
                'name' => (string) $col->name,
                'position' => (int) $col->position,
                'board_id' => (int) $board->board_id,
            ];
        });
    }

    /**
     * Rename a column by id.
     */
    public function renameColumn(int $columnId, string $name): array
    {
        /** @var TestingColumn $col */
        $col = TestingColumn::query()->findOrFail($columnId);
        $col->name = $name;
        $col->save();

        return [
            'column_id' => (int) ($col->column_id ?? $col->getKey()),
            'name' => (string) $col->name,
            'position' => (int) $col->position,
            'board_id' => (int) $col->board_id,
        ];
    }

    /**
     * Reorder columns for a workflow group board.
     *
     * Rule: column_ids must contain ALL columns of the board EXACTLY ONCE.
     */
    public function reorderColumns(string $workflowGroup, array $columnIds): array
    {
        return DB::transaction(function () use ($workflowGroup, $columnIds) {
            /** @var TestingBoard|null $board */
            $board = TestingBoard::query()
                ->where('workflow_group', $workflowGroup)
                ->first();

            if (!$board) {
                abort(422, "Testing board not found for workflow_group: {$workflowGroup}");
            }

            // normalize input ids (ints, unique, preserve order)
            $normalized = [];
            foreach ($columnIds as $raw) {
                if ($raw === null) continue;
                if (is_string($raw)) $raw = trim($raw);
                if ($raw === '' || $raw === false) continue;
                $id = (int) $raw;
                if ($id <= 0) continue;
                if (!in_array($id, $normalized, true)) $normalized[] = $id;
            }

            // fetch existing column ids
            $existing = TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->orderBy('position')
                ->pluck('column_id')
                ->map(fn($v) => (int) $v)
                ->values()
                ->all();

            // validation: must match exactly once
            $a = $normalized;
            $b = $existing;
            sort($a);
            sort($b);

            if ($a !== $b) {
                abort(422, 'column_ids must contain all column ids of the board exactly once.');
            }

            // ✅ SAFE reorder: two-phase shift to avoid unique(board_id, position) collisions
            TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->update(['position' => DB::raw('position + 1000')]);

            foreach (array_values($normalized) as $idx => $columnId) {
                TestingColumn::query()
                    ->where('board_id', $board->board_id)
                    ->where('column_id', (int) $columnId)
                    ->update(['position' => $idx + 1]);
            }

            // return latest order
            $cols = TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->orderBy('position')
                ->get(['column_id', 'name', 'position', 'board_id']);

            return [
                'board_id' => (int) $board->board_id,
                'workflow_group' => (string) $board->workflow_group,
                'columns' => $cols->map(fn($c) => [
                    'column_id' => (int) $c->column_id,
                    'name' => (string) $c->name,
                    'position' => (int) $c->position,
                    'board_id' => (int) $c->board_id,
                ])->all(),
            ];
        });
    }

    public function getBoardCards(int $boardId): array
    {
        // Return latest column per sample for this board.
        // Priority: samples.testing_column_id (fast) else fallback to latest TestingCardEvent.
        $columns = TestingColumn::query()
            ->where('board_id', $boardId)
            ->get(['column_id', 'position']);

        $columnIds = $columns->pluck('column_id')->map(fn($v) => (int) $v)->values()->all();
        if (!$columnIds) return [];

        // Fast path: samples.testing_column_id
        if (Schema::hasColumn('samples', 'testing_column_id')) {
            $rows = Sample::query()
                ->whereIn('testing_column_id', $columnIds)
                ->get(['sample_id', 'testing_column_id', 'lab_sample_code', 'workflow_group']);

            return $rows->map(fn($s) => [
                'sample_id' => (int) $s->sample_id,
                'column_id' => (int) $s->testing_column_id,
                'lab_sample_code' => $s->lab_sample_code,
                'workflow_group' => $s->workflow_group,
            ])->values()->all();
        }

        // Fallback: latest event per sample (heavier)
        $latestEvents = TestingCardEvent::query()
            ->select(['sample_id', 'to_column_id', 'moved_at'])
            ->whereIn('to_column_id', $columnIds)
            ->orderByDesc('moved_at')
            ->orderByDesc('event_id')
            ->get()
            ->groupBy('sample_id')
            ->map(fn($g) => $g->first());

        if ($latestEvents->isEmpty()) return [];

        $sampleIds = $latestEvents->keys()->map(fn($v) => (int) $v)->values()->all();
        $samples = Sample::query()
            ->whereIn('sample_id', $sampleIds)
            ->get(['sample_id', 'lab_sample_code', 'workflow_group'])
            ->keyBy('sample_id');

        return $latestEvents->values()->map(function ($e) use ($samples) {
            $s = $samples->get((int) $e->sample_id);
            return [
                'sample_id' => (int) $e->sample_id,
                'column_id' => (int) $e->to_column_id,
                'lab_sample_code' => $s?->lab_sample_code,
                'workflow_group' => $s?->workflow_group,
            ];
        })->values()->all();
    }

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

        // Fallback: try DB-derived parameters for legacy samples
        $dbOut = $this->extractParameterIdsFromDbFallback($sample);
        if (count($dbOut) > 0) return $dbOut;

        return [];
    }

    /**
     * Strong fallback for legacy samples:
     * Try to derive parameter IDs from DB relations commonly used in this project.
     *
     * @return array<int, int|string|null>
     */
    private function extractParameterIdsFromDbFallback(Sample $sample): array
    {
        $sampleId = (int) $sample->getKey();
        $out = [];

        // 1) sample_tests table (common)
        if (Schema::hasTable('sample_tests') && Schema::hasColumn('sample_tests', 'sample_id')) {
            $rows = DB::table('sample_tests')->where('sample_id', $sampleId)->get();

            foreach ($rows as $r) {
                // a) single parameter_id
                if (property_exists($r, 'parameter_id') && $r->parameter_id !== null) {
                    $out[] = $r->parameter_id;
                }

                // b) json arrays
                foreach (['parameter_ids', 'parameters'] as $jsonField) {
                    if (!property_exists($r, $jsonField)) continue;
                    $val = $r->{$jsonField};
                    if (!$val) continue;

                    if (is_string($val)) {
                        $decoded = json_decode($val, true);
                        if (json_last_error() === JSON_ERROR_NONE) $val = $decoded;
                    }

                    if (!is_array($val)) continue;

                    foreach ($val as $item) {
                        if (is_int($item) || is_string($item)) $out[] = $item;
                        if (is_array($item) && array_key_exists('parameter_id', $item)) $out[] = $item['parameter_id'];
                    }
                }
            }
        }

        // 2) letter_of_order_items.parameters (very likely in your project)
        if (
            Schema::hasTable('letter_of_order_items') &&
            Schema::hasColumn('letter_of_order_items', 'sample_id') &&
            Schema::hasColumn('letter_of_order_items', 'parameters')
        ) {
            $items = DB::table('letter_of_order_items')
                ->where('sample_id', $sampleId)
                ->get(['parameters']);

            foreach ($items as $it) {
                $val = $it->parameters ?? null;
                if (!$val) continue;

                if (is_string($val)) {
                    $decoded = json_decode($val, true);
                    if (json_last_error() === JSON_ERROR_NONE) $val = $decoded;
                }

                // parameters might be array of ids OR array of objects
                if (is_array($val)) {
                    foreach ($val as $p) {
                        if (is_int($p) || is_string($p)) $out[] = $p;
                        if (is_array($p) && array_key_exists('parameter_id', $p)) $out[] = $p['parameter_id'];
                    }
                }
            }
        }

        return $out;
    }
}
