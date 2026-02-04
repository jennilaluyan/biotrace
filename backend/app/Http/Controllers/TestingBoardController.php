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
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Support\AuditLogger;

class TestingBoardController extends Controller
{
    public function __construct(private readonly TestingBoardService $svc) {}

    /**
     * POST /v1/testing-board/move
     * Body:
     * - sample_id: int
     * - to_column_id: int
     * - workflow_group?: string (optional, from FE)
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
                : null
        );

        return response()->json([
            'message' => 'Card moved.',
            'data' => $result,
        ]);
    }

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

        // ✅ NEW: cards state (persisted)
        $cards = $this->svc->getBoardCards((int) $board->board_id);

        // ✅ NEW: last column id (for QC unlock gate)
        $lastColumnId = (int) optional($board->columns->sortByDesc('position')->first())->column_id;

        return response()->json([
            'data' => [
                'board_id' => (int) $board->board_id,
                'workflow_group' => $board->workflow_group,
                'name' => $board->name,
                'last_column_id' => $lastColumnId,
                'columns' => $board->columns->map(fn($c) => [
                    'column_id' => (int) $c->column_id,
                    'name' => $c->name,
                    'position' => (int) $c->position,
                ])->values(),
                'cards' => $cards,
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

        // fetch "before" for audit
        /** @var TestingColumn $before */
        $before = TestingColumn::query()->findOrFail($columnId);
        $oldName = (string) $before->name;
        $boardId = (int) $before->board_id;

        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()->find($boardId);
        $wf = (string) ($board?->workflow_group ?? 'default');

        $newName = (string) $request->validated('name');

        $col = $svc->renameColumn($columnId, $newName);

        // ✅ Step 10.6 — audit
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

    public function addColumn(
        TestingBoardAddColumnRequest $request,
        string $workflowGroup,
        TestingBoardColumnsService $svc
    ): JsonResponse {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $name = (string) $request->validated('name');
        $pos = $request->validated('position');

        $col = $svc->addColumn($workflowGroup, $name, $pos ? (int) $pos : null);

        // ✅ Step 10.6 — audit
        AuditLogger::logTestingColumnAdded(
            staffId: (int) $staff->staff_id,
            columnId: (int) $col->column_id,
            boardId: (int) $col->board_id,
            workflowGroup: (string) $workflowGroup,
            name: (string) $col->name,
            position: (int) $col->position
        );

        return response()->json([
            'message' => 'Column added.',
            'data' => [
                'column_id' => (int) $col->column_id,
                'name' => $col->name,
                'position' => (int) $col->position,
                'board_id' => (int) $col->board_id,
            ],
        ], 201);
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

        // ✅ capture "before" order for audit
        $beforeCols = TestingColumn::query()
            ->where('board_id', $boardId)
            ->orderBy('position')
            ->get(['column_id', 'name', 'position']);

        $oldOrder = $beforeCols->map(fn($c) => [
            'column_id' => (int) $c->column_id,
            'name' => (string) $c->name,
            'position' => (int) $c->position,
        ])->values()->all();

        // Validate payload contains all board columns exactly once
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

        // ✅ capture "after" order for audit
        $afterCols = TestingColumn::query()
            ->where('board_id', $boardId)
            ->orderBy('position')
            ->get(['column_id', 'name', 'position']);

        $newOrder = $afterCols->map(fn($c) => [
            'column_id' => (int) $c->column_id,
            'name' => (string) $c->name,
            'position' => (int) $c->position,
        ])->values()->all();

        // ✅ Step 10.6 — audit
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
}
