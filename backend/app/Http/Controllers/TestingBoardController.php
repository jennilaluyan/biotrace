<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use App\Services\TestingBoardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use App\Http\Requests\TestingBoardMoveRequest;
use App\Models\TestingBoard;
use App\Http\Requests\TestingBoardRenameColumnRequest;
use App\Http\Requests\TestingBoardAddColumnRequest;
use App\Http\Requests\TestingBoardReorderColumnsRequest;
use App\Services\TestingBoardColumnsService;

class TestingBoardController extends Controller
{
    public function __construct(private readonly TestingBoardService $svc) {}

    /**
     * POST /v1/testing-board/move
     * Body:
     * - sample_id: int
     * - to_column_id: int
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
            sampleId: (int) $payload['sample_id'],
            toColumnId: (int) $payload['to_column_id'],
            actorStaffId: (int) $staff->staff_id
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
                'board_id' => $board->board_id,
                'workflow_group' => $board->workflow_group,
                'name' => $board->name,
                'columns' => $board->columns->map(fn($c) => [
                    'column_id' => $c->column_id,
                    'name' => $c->name,
                    'position' => $c->position,
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

    public function reorderColumns(
        TestingBoardReorderColumnsRequest $request,
        string $workflowGroup,
        TestingBoardColumnsService $svc
    ): JsonResponse {
        $ids = $request->validated('column_ids');

        $ordered = $svc->reorderColumns($workflowGroup, array_map('intval', $ids));

        return response()->json([
            'message' => 'Columns reordered.',
            'data' => [
                'workflow_group' => $workflowGroup,
                'column_ids' => $ordered,
            ],
        ]);
    }
}
