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
        ?string $workflowGroupOverride = null,
        bool $finalize = false
    ): array {
        return DB::transaction(function () use ($sampleId, $toColumnId, $actorStaffId, $workflowGroupOverride, $finalize) {
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

            // ✅ Opportunistic backfill:
            // kalau sample.workflow_group kosong / beda -> tulis balik (biar sampel lama ikut)
            if (Schema::hasColumn('samples', 'workflow_group')) {
                $oldGroup = $sample->getAttribute('workflow_group');
                $oldGroupNorm = $oldGroup !== null ? trim((string) $oldGroup) : null;
                $newGroupNorm = trim((string) $workflowGroup);

                if ($newGroupNorm !== '' && $oldGroupNorm !== $newGroupNorm) {
                    $sample->setAttribute('workflow_group', $newGroupNorm);
                    $sample->save();

                    // best-effort audit (kalau method ada)
                    if (method_exists(AuditLogger::class, 'logWorkflowGroupChanged')) {
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
                        } catch (\Throwable $e) {
                            // ignore audit failure
                        }
                    }
                }
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

            // ✅ Find current column (best effort)
            $fromColumnId = null;

            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $raw = $sample->getAttribute('testing_column_id');
                $fromColumnId = $raw !== null ? (int) $raw : null;
            }

            if ($fromColumnId === null) {
                $latest = TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->orderByDesc(Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id')
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

            // Determine last column for QC gate + finalize
            $lastColumn = TestingColumn::query()
                ->where('board_id', (int) $board->board_id)
                ->orderByDesc('position')
                ->first();

            $lastColumnId = (int) ($lastColumn?->column_id ?? 0);

            $isAtLast = $lastColumnId > 0 && (int) $toColumnId === $lastColumnId;
            $isFinalizeCall = $finalize && $isAtLast && $fromColumnId !== null && (int) $fromColumnId === (int) $toColumnId;

            // ✅ FINALIZE MODE:
            if ($isFinalizeCall) {
                $updated = false;
                $eventId = null;

                if (Schema::hasTable('testing_card_events') && Schema::hasColumn('testing_card_events', 'exited_at')) {
                    $q = TestingCardEvent::query()
                        ->where('sample_id', $sampleId)
                        ->orderByDesc(Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id')
                        ->orderByDesc('event_id');

                    $open = (clone $q)->whereNull('exited_at')->first();
                    $target = $open ?: $q->first();

                    if ($target) {
                        $target->exited_at = $now;
                        $target->save();

                        $updated = true;
                        $eventId = (int) ($target->event_id ?? $target->getKey());
                    }
                }

                // Unlock QC (only once)
                if (
                    $isAtLast &&
                    Schema::hasColumn('samples', 'quality_cover_unlocked_at') &&
                    !$sample->getAttribute('quality_cover_unlocked_at')
                ) {
                    $sample->setAttribute('quality_cover_unlocked_at', $now);

                    if (Schema::hasColumn('samples', 'quality_cover_unlocked_by_staff_id')) {
                        $sample->setAttribute('quality_cover_unlocked_by_staff_id', (int) $actorStaffId);
                    }

                    $sample->save();

                    AuditLogger::logQualityCoverUnlocked(
                        (int) $actorStaffId,
                        (int) $sample->sample_id,
                        (int) $board->board_id,
                        (int) $toColumnId,
                        (string) $workflowGroup
                    );
                }

                // ✅ Mark testing as completed (if columns exist)
                // FE uses these flags to open Quality Cover only after DONE
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
                    note: $updated ? 'finalized_last_stage' : 'finalize_no_event_updated'
                );

                return [
                    'sample_id' => (int) $sampleId,
                    'workflow_group' => (string) $workflowGroup,
                    'board_id' => (int) $board->board_id,
                    'from_column_id' => $fromColumnId !== null ? (int) $fromColumnId : null,
                    'to_column_id' => (int) $toColumnId,
                    'event_id' => $eventId,
                    'moved_at' => $now->toISOString(),
                    'finalized' => true,
                ];
            }

            // NORMAL MOVE MODE

            // Close previous open stage (if schema supports it)
            if (Schema::hasTable('testing_card_events') && Schema::hasColumn('testing_card_events', 'exited_at')) {
                TestingCardEvent::query()
                    ->where('sample_id', $sampleId)
                    ->whereNull('exited_at')
                    ->orderByDesc(Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id')
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

            if (Schema::hasColumn('testing_card_events', 'moved_at')) $eventData['moved_at'] = $now;
            if (Schema::hasColumn('testing_card_events', 'entered_at')) $eventData['entered_at'] = $now;

            /** @var TestingCardEvent $created */
            $created = TestingCardEvent::query()->create($eventData);

            // Persist current column to samples
            if (Schema::hasColumn('samples', 'testing_column_id')) {
                $sample->setAttribute('testing_column_id', (int) $toColumnId);
                $sample->save();
            }

            $eventId = (int) ($created->event_id ?? $created->getKey());

            // QC unlock gate: unlock when reaching last column (only once)
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

                    AuditLogger::logQualityCoverUnlocked(
                        (int) $actorStaffId,
                        (int) $sample->sample_id,
                        (int) $board->board_id,
                        (int) $toColumnId,
                        (string) $workflowGroup
                    );
                }
            }

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
                'finalized' => false,
            ];
        });
    }

    /**
     * Cards for a board: show samples currently in any column.
     * ✅ IMPORTANT: do NOT filter only exited_at NULL when picking "latest event",
     * because FE needs timestamps for previous columns too.
     */
    public function getBoardCards(int $boardId): array
    {
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

            $sampleIds = $rows->pluck('sample_id')->map(fn($v) => (int) $v)->values()->all();

            // latest event per sample (NO exited filter)
            $eventsBySample = collect();
            if ($sampleIds && Schema::hasTable('testing_card_events')) {
                $q = TestingCardEvent::query()
                    ->where('board_id', (int) $boardId)
                    ->whereIn('sample_id', $sampleIds);

                $cols = ['event_id', 'sample_id', 'to_column_id', 'from_column_id'];
                if (Schema::hasColumn('testing_card_events', 'moved_at')) $cols[] = 'moved_at';
                if (Schema::hasColumn('testing_card_events', 'entered_at')) $cols[] = 'entered_at';
                if (Schema::hasColumn('testing_card_events', 'exited_at')) $cols[] = 'exited_at';
                if (Schema::hasColumn('testing_card_events', 'created_at')) $cols[] = 'created_at';

                $orderCol = Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id';

                $eventsBySample = $q->orderByDesc($orderCol)
                    ->orderByDesc('event_id')
                    ->get($cols)
                    ->groupBy('sample_id')
                    ->map(fn($g) => $g->first());
            }

            return $rows->map(function ($s) use ($eventsBySample) {
                $e = $eventsBySample->get((int) $s->sample_id);

                $movedAt = $e?->moved_at ?? ($e?->created_at ?? null);

                return [
                    'sample_id' => (int) $s->sample_id,
                    'column_id' => (int) $s->testing_column_id,
                    'lab_sample_code' => $s->lab_sample_code,
                    'workflow_group' => $s->workflow_group,

                    'event_id' => $e?->event_id ? (int) $e->event_id : null,
                    'entered_at' => $e?->entered_at ?? null,
                    'moved_at' => $movedAt,
                    'exited_at' => $e?->exited_at ?? null,
                ];
            })->values()->all();
        }

        // fallback: latest event per sample (board-scoped)
        if (!Schema::hasTable('testing_card_events')) return [];

        $select = ['event_id', 'sample_id', 'to_column_id', 'from_column_id'];
        if (Schema::hasColumn('testing_card_events', 'moved_at')) $select[] = 'moved_at';
        if (Schema::hasColumn('testing_card_events', 'entered_at')) $select[] = 'entered_at';
        if (Schema::hasColumn('testing_card_events', 'exited_at')) $select[] = 'exited_at';
        if (Schema::hasColumn('testing_card_events', 'created_at')) $select[] = 'created_at';

        $orderCol = Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id';

        $latestEvents = TestingCardEvent::query()
            ->select($select)
            ->where('board_id', (int) $boardId)
            ->whereIn('to_column_id', $columnIds)
            ->orderByDesc($orderCol)
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
            $movedAt = $e?->moved_at ?? ($e?->created_at ?? null);

            return [
                'sample_id' => (int) $e->sample_id,
                'column_id' => (int) $e->to_column_id,
                'lab_sample_code' => $s?->lab_sample_code,
                'workflow_group' => $s?->workflow_group,

                'event_id' => $e?->event_id ? (int) $e->event_id : null,
                'entered_at' => $e?->entered_at ?? null,
                'moved_at' => $movedAt,
                'exited_at' => $e?->exited_at ?? null,
            ];
        })->values()->all();
    }

    /**
     * ✅ Return full timeline/events for ONE sample inside a board.
     * FE will use this to render timestamps for previous columns and keep them after refresh.
     */
    public function getSampleTimeline(int $boardId, int $sampleId): array
    {
        if (!Schema::hasTable('testing_card_events')) return [];

        $cols = ['event_id', 'sample_id', 'from_column_id', 'to_column_id'];
        if (Schema::hasColumn('testing_card_events', 'moved_at')) $cols[] = 'moved_at';
        if (Schema::hasColumn('testing_card_events', 'entered_at')) $cols[] = 'entered_at';
        if (Schema::hasColumn('testing_card_events', 'exited_at')) $cols[] = 'exited_at';
        if (Schema::hasColumn('testing_card_events', 'created_at')) $cols[] = 'created_at';

        $orderCol = Schema::hasColumn('testing_card_events', 'moved_at') ? 'moved_at' : 'event_id';

        return TestingCardEvent::query()
            ->where('board_id', (int) $boardId)
            ->where('sample_id', (int) $sampleId)
            ->orderBy($orderCol, 'asc')
            ->orderBy('event_id', 'asc')
            ->get($cols)
            ->map(function ($e) {
                $movedAt = $e->moved_at ?? ($e->created_at ?? null);

                return [
                    'event_id' => (int) ($e->event_id ?? $e->getKey()),
                    'sample_id' => (int) $e->sample_id,
                    'from_column_id' => $e->from_column_id !== null ? (int) $e->from_column_id : null,
                    'to_column_id' => $e->to_column_id !== null ? (int) $e->to_column_id : null,
                    'moved_at' => $movedAt,
                    'entered_at' => $e->entered_at ?? null,
                    'exited_at' => $e->exited_at ?? null,
                ];
            })
            ->values()
            ->all();
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

            if (is_string($val)) {
                $decoded = json_decode($val, true);
                if (json_last_error() === JSON_ERROR_NONE) $val = $decoded;
            }

            if (!is_array($val)) continue;

            $out = [];
            foreach ($val as $row) {
                if (is_int($row) || is_string($row)) {
                    $out[] = $row;
                    continue;
                }
                if (is_array($row) && array_key_exists('parameter_id', $row)) {
                    $out[] = $row['parameter_id'];
                    continue;
                }
            }

            if (count($out) > 0) {
                $out = array_values(array_unique(array_map('intval', $out)));
                $out = array_values(array_filter($out, fn($v) => (int) $v > 0));
                return $out;
            }
        }

        // ✅ NEW fallback: pivot sample_requested_parameters (request workflow)
        $pivotOut = $this->extractParameterIdsFromRequestedPivot($sample);
        if (count($pivotOut) > 0) return $pivotOut;

        $dbOut = $this->extractParameterIdsFromDbFallback($sample);
        if (count($dbOut) > 0) return $dbOut;

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

        $rows = array_values(array_unique(array_filter($rows, fn($v) => (int) $v > 0)));
        return $rows;
    }

    private function extractParameterIdsFromDbFallback(Sample $sample): array
    {
        $sampleId = (int) $sample->getKey();
        $out = [];

        if (Schema::hasTable('sample_tests') && Schema::hasColumn('sample_tests', 'sample_id')) {
            $rows = DB::table('sample_tests')->where('sample_id', $sampleId)->get();

            foreach ($rows as $r) {
                if (property_exists($r, 'parameter_id') && $r->parameter_id !== null) {
                    $out[] = $r->parameter_id;
                }

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

                if (is_array($val)) {
                    foreach ($val as $p) {
                        if (is_int($p) || is_string($p)) $out[] = $p;
                        if (is_array($p) && array_key_exists('parameter_id', $p)) $out[] = $p['parameter_id'];
                    }
                }
            }
        }

        $out = array_values(array_unique(array_map('intval', $out)));
        $out = array_values(array_filter($out, fn($v) => (int) $v > 0));
        return $out;
    }
}
