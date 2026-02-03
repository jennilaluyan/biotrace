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
            // shift positions to make room if inserting in middle
            TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->where('position', '>=', $insertPos)
                ->increment('position');

            /** @var TestingColumn $col */
            $col = TestingColumn::query()->create([
                'board_id' => (int) $board->board_id,
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
