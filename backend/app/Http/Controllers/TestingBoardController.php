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

        return response()->json([
            'data' => [
                'board_id' => (int) $board->board_id,
                'workflow_group' => $board->workflow_group,
                'name' => $board->name,
                'columns' => $board->columns->map(fn($c) => [
                    'column_id' => (int) $c->column_id,
                    'name' => $c->name,
                    'position' => (int) $c->position,
                ])->values(),
            ],
        ]);
    }

    public function renameColumn(
        TestingBoardRenameColumnRequest $request,
        int $columnId,
        TestingBoardColumnsService $svc
    ): JsonResponse {
        $col = $svc->renameColumn($columnId, (string) $request->validated('name'));

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
        $name = (string) $request->validated('name');
        $pos = $request->validated('position');

        $col = $svc->addColumn($workflowGroup, $name, $pos ? (int) $pos : null);

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

    /**
     * PUT /v1/testing-board/{workflowGroup}/columns/reorder
     * Body:
     * - column_ids: int[] (MUST contain all column ids of the board exactly once)
     *
     * IMPORTANT:
     * board has unique constraint (board_id, position) so we must "shift" positions first
     * to avoid collisions during reorder.
     */
    public function reorderColumns(
        TestingBoardReorderColumnsRequest $request,
        string $workflowGroup
    ): JsonResponse {
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

        // Validate: payload must contain ALL board columns exactly once
        $existingIds = TestingColumn::query()
            ->where('board_id', $boardId)
            ->pluck('column_id')
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
            // 1) Move all existing positions out of the way (avoid unique collisions)
            TestingColumn::query()
                ->where('board_id', $boardId)
                ->update(['position' => DB::raw('position + 1000')]);

            // 2) Apply new order (1..N)
            foreach (array_values($columnIds) as $idx => $columnId) {
                TestingColumn::query()
                    ->where('board_id', $boardId)
                    ->where('column_id', (int) $columnId)
                    ->update(['position' => $idx + 1]);
            }
        });

        return response()->json([
            'message' => 'Columns reordered.',
            'data' => [
                'workflow_group' => $workflowGroup,
                'column_ids' => $columnIds,
            ],
        ]);
    }
}
