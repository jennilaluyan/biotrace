<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use App\Services\TestingBoardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use App\Http\Requests\TestingBoardMoveRequest;
use App\Models\TestingBoard;

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
}
