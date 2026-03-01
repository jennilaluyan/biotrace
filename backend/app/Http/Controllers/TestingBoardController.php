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
     *
     * Body:
     * - sample_id: int
     * - to_column_id: int
     * - workflow_group?: string (optional, from FE; may be NEW or legacy key)
     * - finalize?: bool (optional) mark exited_at on current/last column without moving
     *
     * Notes:
     * - FE uses NEW workflow groups: pcr | sequencing | rapid | microbiology
     * - DB testing_boards currently stores legacy keys. We alias incoming keys to legacy board keys.
     */
    public function move(TestingBoardMoveRequest $request): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $payload = $request->validated();

        $incomingGroup = (isset($payload['workflow_group']) && $payload['workflow_group'])
            ? (string) $payload['workflow_group']
            : null;

        $boardGroup = $this->normalizeWorkflowGroupForBoard($incomingGroup);

        $result = $this->svc->moveCard(
            (int) $payload['sample_id'],
            (int) $payload['to_column_id'],
            (int) $staff->staff_id,
            $boardGroup,
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
     * Returns:
     * - columns + cards (current board state)
     * - last_column_id
     * - events (timeline for ONE sample; optional) used by FE to render stable timestamps
     *
     * Compatibility:
     * - Accepts NEW keys (pcr|sequencing|rapid|microbiology) and legacy keys.
     * - Resolves to the legacy board key for DB lookup.
     * - Responds with NEW key in `workflow_group` for FE consistency.
     */
    public function show(string $workflowGroup): JsonResponse
    {
        $publicGroup = $this->normalizeWorkflowGroupPublic($workflowGroup);
        $boardGroup = $this->normalizeWorkflowGroupForBoard($workflowGroup) ?? $workflowGroup;

        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()
            ->with(['columns' => function ($q) {
                $q->orderBy('position');
            }])
            ->where('workflow_group', $boardGroup)
            ->first();

        // Best-effort fallback: if alias doesn't exist but legacy key was passed and exists.
        if (!$board && $boardGroup !== $workflowGroup) {
            $board = TestingBoard::query()
                ->with(['columns' => function ($q) {
                    $q->orderBy('position');
                }])
                ->where('workflow_group', $workflowGroup)
                ->first();
        }

        if (!$board) {
            return response()->json(['message' => 'Board not found.'], 404);
        }

        $boardId = (int) $board->board_id;

        // Cards state (persisted)
        $cards = $this->svc->getBoardCards($boardId);

        // Last column id (used by FE for QC unlock gate)
        $lastColumnId = (int) optional($board->columns->sortByDesc('position')->first())->column_id;

        // Optional timeline events for a specific sample
        $sampleId = (int) request()->query('sample_id', 0);
        $events = [];
        if ($sampleId > 0 && method_exists($this->svc, 'getSampleTimeline')) {
            $events = $this->svc->getSampleTimeline($boardId, $sampleId);
        }

        return response()->json([
            'data' => [
                'board_id' => $boardId,

                // NEW key for FE
                'workflow_group' => $publicGroup,

                // Keep the board key for debugging/traceability
                'board_workflow_group' => (string) $board->workflow_group,

                'name' => $board->name,
                'last_column_id' => $lastColumnId,

                'columns' => $board->columns->map(fn($c) => [
                    'column_id' => (int) $c->column_id,
                    'name' => (string) $c->name,
                    'position' => (int) $c->position,
                    'board_id' => (int) $c->board_id,
                ])->values(),

                'cards' => $cards,

                // Timeline events (optional)
                'events' => $events,
            ],
        ]);
    }

    /**
     * PATCH /v1/testing-board/columns/{columnId}
     *
     * Rename one column. Audit logs use the board's stored workflow_group (legacy key).
     */
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
        $boardWf = (string) ($board?->workflow_group ?? 'default');

        $newName = (string) $request->validated('name');

        $col = $svc->renameColumn($columnId, $newName);

        AuditLogger::logTestingColumnRenamed(
            staffId: (int) $staff->staff_id,
            columnId: (int) $columnId,
            boardId: (int) ($col->board_id ?? $boardId),
            workflowGroup: $boardWf,
            oldName: $oldName,
            newName: (string) ($col->name ?? $newName)
        );

        return response()->json([
            'message' => 'Column renamed.',
            'data' => [
                'column_id' => (int) $col->column_id,
                'name' => (string) $col->name,
                'position' => (int) $col->position,
                'board_id' => (int) $col->board_id,
            ],
        ]);
    }

    /**
     * PUT /v1/testing-board/{workflowGroup}/columns/reorder
     *
     * Reorders all columns in a board. Accepts NEW or legacy workflowGroup key.
     */
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

        $publicGroup = $this->normalizeWorkflowGroupPublic($workflowGroup);
        $boardGroup = $this->normalizeWorkflowGroupForBoard($workflowGroup) ?? $workflowGroup;

        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()
            ->where('workflow_group', $boardGroup)
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
                    'workflow_group' => $publicGroup,
                    'board_workflow_group' => $boardGroup,
                    'expected_column_ids' => $existingIds,
                    'received_column_ids' => $columnIds,
                ],
            ], 422);
        }

        DB::transaction(function () use ($boardId, $columnIds) {
            // Make space for reordering (avoid unique/ordering collisions)
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
            workflowGroup: (string) $boardGroup,
            oldOrder: $oldOrder,
            newOrder: $newOrder
        );

        return response()->json([
            'message' => 'Columns reordered.',
            'data' => [
                'workflow_group' => $publicGroup,
                'board_workflow_group' => $boardGroup,
                'column_ids' => $columnIds,
            ],
        ]);
    }

    /**
     * POST /v1/testing-board/{workflowGroup}/columns
     *
     * Adds one column to a board. Accepts NEW or legacy workflowGroup key.
     */
    public function addColumn(TestingBoardAddColumnRequest $request): JsonResponse
    {
        /** @var Staff|null $staff */
        $staff = Auth::user();
        if ($staff && !$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $data = $request->validated();

        $publicGroup = $this->normalizeWorkflowGroupPublic((string) $data['workflow_group']);
        $boardGroup = $this->normalizeWorkflowGroupForBoard((string) $data['workflow_group']) ?? (string) $data['workflow_group'];

        $col = $this->columnsService->addColumn(
            workflowGroup: $boardGroup,
            name: (string) $data['name'],
            position: $data['position'] ?? null,
            relativeToColumnId: $data['relative_to_column_id'] ?? null,
            side: $data['side'] ?? null,
            createdByStaffId: $staff?->staff_id
        );

        return response()->json([
            'message' => 'Column added.',
            'data' => $col,
            'meta' => [
                'workflow_group' => $publicGroup,
                'board_workflow_group' => $boardGroup,
            ],
        ], 201);
    }

    /**
     * DELETE /v1/testing-board/columns/{columnId}
     */
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

    /**
     * Normalize any key (new or legacy) into the NEW public key used by FE and stored on samples.workflow_group.
     */
    private function normalizeWorkflowGroupPublic(?string $group): string
    {
        $g = strtolower(trim((string) ($group ?? '')));
        if ($g === '') return 'default';

        return match ($g) {
            // NEW keys
            'pcr', 'sequencing', 'rapid', 'microbiology' => $g,

            // legacy -> new
            'pcr_sars_cov_2' => 'pcr',
            'wgs_sars_cov_2' => 'sequencing',
            'antigen' => 'rapid',

            // legacy groups now consolidated into microbiology
            'group_19_22', 'group_23_32' => 'microbiology',

            default => $g,
        };
    }

    /**
     * Normalize NEW public keys into EXISTING DB board keys (legacy storage).
     *
     * Requirement:
     * - microbiology MUST use the previous workflow for group_19_22
     * - old group_23_32 is also redirected to group_19_22
     */
    private function normalizeWorkflowGroupForBoard(?string $group): ?string
    {
        $g = strtolower(trim((string) ($group ?? '')));
        if ($g === '') return null;

        return match ($g) {
            // new -> legacy board keys
            'pcr' => 'pcr_sars_cov_2',
            'sequencing' => 'wgs_sars_cov_2',
            'rapid' => 'antigen',
            'microbiology' => 'group_19_22',

            // legacy kept
            'pcr_sars_cov_2' => 'pcr_sars_cov_2',
            'wgs_sars_cov_2' => 'wgs_sars_cov_2',
            'antigen' => 'antigen',
            'group_19_22' => 'group_19_22',

            // legacy redirected
            'group_23_32' => 'group_19_22',

            default => $g,
        };
    }
}
