<?php

namespace App\Http\Controllers;

use App\Http\Requests\TestingBoardAddColumnRequest;
use App\Http\Requests\TestingBoardMoveRequest;
use App\Http\Requests\TestingBoardRenameColumnRequest;
use App\Http\Requests\TestingBoardReorderColumnsRequest;
use App\Models\Staff;
use App\Models\TestingBoard;
use App\Models\TestingColumn;
use App\Services\TestingBoardColumnsService;
use App\Services\TestingBoardService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class TestingBoardController extends Controller
{
    public function __construct(
        private readonly TestingBoardService $svc,
        private readonly TestingBoardColumnsService $columnsService,
    ) {}

    /**
     * POST /v1/testing-board/move
     * Body:
     * - sample_id: int
     * - to_column_id: int
     * - workflow_group?: string (optional, from FE)
     * - finalize?: bool (optional)  ✅ record exited_at on last column without moving
     */
    public function move(TestingBoardMoveRequest $request): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $payload = $request->validated();

        $result = $this->svc->moveCard(
            (int) $payload['sample_id'],
            (int) $payload['to_column_id'],
            (int) $staff->staff_id,
            (isset($payload['workflow_group']) && $payload['workflow_group'])
                ? (string) $payload['workflow_group']
                : null,
            (bool) ($payload['finalize'] ?? false),
        );

        return response()->json([
            'message' => 'Card moved.',
            'data' => $result,
        ]);
    }

    /**
     * GET /v1/testing-board/{workflowGroup}?sample_id=123
     *
     * ✅ Returns:
     * - columns + cards (current board state)
     * - last_column_id
     * - events (timeline per sample) -> used by FE to render timestamps on previous columns (stable after refresh)
     */
    public function show(string $workflowGroup): JsonResponse
    {
        $board = TestingBoard::query()
            ->with(['columns' => function ($q) {
                $q->orderBy('position');
            }])
            ->where('workflow_group', $workflowGroup)
            ->first();

        if (!$board) {
            return response()->json(['message' => 'Board not found.'], 404);
        }

        $boardId = (int) $board->board_id;

        // ✅ cards state (persisted)
        $cards = $this->svc->getBoardCards($boardId);

        // ✅ last column id (for QC unlock gate)
        $lastColumnId = (int) optional($board->columns->sortByDesc('position')->first())->column_id;

        // ✅ timeline events for ONE sample (optional)
        // FE should call with ?sample_id=... to keep column timestamps stable
        $sampleId = (int) request()->query('sample_id', 0);
        $events = [];
        if ($sampleId > 0) {
            // method added in service: getSampleTimeline(boardId, sampleId)
            if (method_exists($this->svc, 'getSampleTimeline')) {
                $events = $this->svc->getSampleTimeline($boardId, $sampleId);
            }
        }

        return response()->json([
            'data' => [
                'board_id' => $boardId,
                'workflow_group' => $board->workflow_group,
                'name' => $board->name,
                'last_column_id' => $lastColumnId,

                'columns' => $board->columns->map(fn($c) => [
                    'column_id' => (int) $c->column_id,
                    'name' => $c->name,
                    'position' => (int) $c->position,
                    'board_id' => (int) $c->board_id,
                ])->values(),

                'cards' => $cards,

                // ✅ NEW: timeline events (for previous column timestamps)
                'events' => $events,
            ],
        ]);
    }

    public function renameColumn(
        TestingBoardRenameColumnRequest $request,
        int $columnId,
        TestingBoardColumnsService $svc
    ): JsonResponse {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        /** @var TestingColumn $before */
        $before = TestingColumn::query()->findOrFail($columnId);
        $oldName = (string) $before->name;
        $boardId = (int) $before->board_id;

        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()->find($boardId);
        $wf = (string) ($board?->workflow_group ?? 'default');

        $newName = (string) $request->validated('name');

        $col = $svc->renameColumn($columnId, $newName);

        AuditLogger::logTestingColumnRenamed(
            staffId: (int) $staff->staff_id,
            columnId: (int) $columnId,
            boardId: (int) ($col->board_id ?? $boardId),
            workflowGroup: $wf,
            oldName: $oldName,
            newName: (string) ($col->name ?? $newName)
        );

        return response()->json([
            'message' => 'Column renamed.',
            'data' => [
                'column_id' => (int) $col->column_id,
                'name' => $col->name,
                'position' => (int) $col->position,
                'board_id' => (int) $col->board_id,
            ],
        ]);
    }

    public function reorderColumns(
        TestingBoardReorderColumnsRequest $request,
        string $workflowGroup
    ): JsonResponse {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $ids = $request->validated('column_ids');
        $columnIds = array_values(array_map('intval', (array) $ids));

        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()
            ->where('workflow_group', $workflowGroup)
            ->first();

        if (!$board) {
            return response()->json(['message' => 'Board not found.'], 404);
        }

        $boardId = (int) $board->board_id;

        $beforeCols = TestingColumn::query()
            ->where('board_id', $boardId)
            ->orderBy('position')
            ->get(['column_id', 'name', 'position']);

        $oldOrder = $beforeCols->map(fn($c) => [
            'column_id' => (int) $c->column_id,
            'name' => (string) $c->name,
            'position' => (int) $c->position,
        ])->values()->all();

        $existingIds = $beforeCols->pluck('column_id')
            ->map(fn($v) => (int) $v)
            ->values()
            ->all();

        sort($existingIds);
        $payloadSorted = $columnIds;
        sort($payloadSorted);

        if ($existingIds !== $payloadSorted) {
            return response()->json([
                'message' => 'column_ids must contain all column ids of the board exactly once.',
                'context' => [
                    'workflow_group' => $workflowGroup,
                    'expected_column_ids' => $existingIds,
                    'received_column_ids' => $columnIds,
                ],
            ], 422);
        }

        DB::transaction(function () use ($boardId, $columnIds) {
            TestingColumn::query()
                ->where('board_id', $boardId)
                ->update(['position' => DB::raw('position + 1000')]);

            foreach (array_values($columnIds) as $idx => $columnId) {
                TestingColumn::query()
                    ->where('board_id', $boardId)
                    ->where('column_id', (int) $columnId)
                    ->update(['position' => $idx + 1]);
            }
        });

        $afterCols = TestingColumn::query()
            ->where('board_id', $boardId)
            ->orderBy('position')
            ->get(['column_id', 'name', 'position']);

        $newOrder = $afterCols->map(fn($c) => [
            'column_id' => (int) $c->column_id,
            'name' => (string) $c->name,
            'position' => (int) $c->position,
        ])->values()->all();

        AuditLogger::logTestingColumnsReordered(
            staffId: (int) $staff->staff_id,
            boardId: (int) $boardId,
            workflowGroup: (string) $workflowGroup,
            oldOrder: $oldOrder,
            newOrder: $newOrder
        );

        return response()->json([
            'message' => 'Columns reordered.',
            'data' => [
                'workflow_group' => $workflowGroup,
                'column_ids' => $columnIds,
            ],
        ]);
    }

    public function addColumn(TestingBoardAddColumnRequest $request): JsonResponse
    {
        /** @var Staff|null $staff */
        $staff = Auth::user();
        if ($staff && !$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $data = $request->validated();

        $col = $this->columnsService->addColumn(
            workflowGroup: $data['workflow_group'],
            name: $data['name'],
            position: $data['position'] ?? null,
            relativeToColumnId: $data['relative_to_column_id'] ?? null,
            side: $data['side'] ?? null,
            createdByStaffId: $staff?->staff_id
        );

        return response()->json([
            'message' => 'Column added.',
            'data' => $col,
        ], 201);
    }

    public function deleteColumn(int $columnId): JsonResponse
    {
        /** @var Staff|null $staff */
        $staff = Auth::user();
        if ($staff && !$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->columnsService->deleteColumn($columnId);

        return response()->json([
            'message' => 'Column deleted.',
        ]);
    }
}
