<?php

namespace App\Services;

use App\Models\TestingBoard;
use App\Models\TestingColumn;
use Illuminate\Support\Facades\DB;

class TestingBoardColumnsService
{
    public function renameColumn(int $columnId, string $name): TestingColumn
    {
        /** @var TestingColumn $col */
        $col = TestingColumn::query()->findOrFail($columnId);
        $col->name = $name;
        $col->save();

        return $col;
    }

    public function addColumn(string $workflowGroup, string $name, ?int $position = null): TestingColumn
    {
        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()->where('workflow_group', $workflowGroup)->first();
        if (!$board) abort(404, 'Board not found.');

        $maxPos = (int) TestingColumn::query()
            ->where('board_id', $board->board_id)
            ->max('position');

        $insertPos = $position ? max(1, $position) : ($maxPos + 1);

        return DB::transaction(function () use ($board, $name, $insertPos) {
            $boardId = (int) $board->board_id;

            // 1) Move affected positions to a safe temporary range (avoid unique collisions)
            // Example: if inserting at 2, move positions >=2 to +1000 first
            TestingColumn::query()
                ->where('board_id', $boardId)
                ->where('position', '>=', $insertPos)
                ->update([
                    'position' => DB::raw('position + 1000'),
                ]);

            // 2) Bring them back shifted by +1 (still safe because they are in 1000+ range)
            TestingColumn::query()
                ->where('board_id', $boardId)
                ->where('position', '>=', $insertPos + 1000)
                ->update([
                    'position' => DB::raw('position - 999'),
                ]);

            /** @var TestingColumn $col */
            $col = TestingColumn::query()->create([
                'board_id' => $boardId,
                'name' => $name,
                'position' => (int) $insertPos,
            ]);

            return $col;
        });
    }

    /**
     * @param array<int,int> $columnIds
     */
    public function reorderColumns(string $workflowGroup, array $columnIds): array
    {
        /** @var TestingBoard|null $board */
        $board = TestingBoard::query()->where('workflow_group', $workflowGroup)->first();
        if (!$board) abort(404, 'Board not found.');

        // Ensure all columns belong to same board + no missing columns
        $cols = TestingColumn::query()
            ->where('board_id', $board->board_id)
            ->pluck('column_id')
            ->map(fn($id) => (int) $id)
            ->values()
            ->all();

        $given = array_map('intval', $columnIds);
        sort($cols);
        $sortedGiven = $given;
        sort($sortedGiven);

        if ($sortedGiven !== $cols) {
            abort(422, 'column_ids must contain all column_ids of the board exactly once.');
        }

        DB::transaction(function () use ($given, $board) {
            $pos = 1;
            foreach ($given as $cid) {
                TestingColumn::query()
                    ->where('board_id', $board->board_id)
                    ->where('column_id', $cid)
                    ->update(['position' => $pos]);
                $pos++;
            }
        });

        return $given;
    }
}
