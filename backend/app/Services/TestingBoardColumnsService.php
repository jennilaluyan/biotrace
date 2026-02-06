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

    public function addColumn(
        string $workflowGroup,
        string $name,
        ?int $position = null,
        ?int $relativeToColumnId = null,
        ?string $side = null,
        ?int $createdByStaffId = null
    ): TestingColumn {
        return DB::transaction(function () use (
            $workflowGroup,
            $name,
            $position,
            $relativeToColumnId,
            $side,
            $createdByStaffId
        ) {
            /** @var TestingBoard $board */
            $board = TestingBoard::query()
                ->where('workflow_group', $workflowGroup)
                ->firstOrFail();

            // Tentukan posisi insert
            $insertPos = $position;

            if ($insertPos === null && $relativeToColumnId !== null) {
                /** @var TestingColumn $ref */
                $ref = TestingColumn::query()->findOrFail($relativeToColumnId);
                if ((int)$ref->board_id !== (int)$board->board_id) {
                    abort(422, 'relative_to_column_id is not in the same board.');
                }

                $refPos = (int)$ref->position;
                $insertPos = ($side === 'left') ? $refPos : ($refPos + 1);
            }

            if ($insertPos === null) {
                // append
                $maxPos = (int) (TestingColumn::query()
                    ->where('board_id', $board->board_id)
                    ->max('position') ?? -1);
                $insertPos = $maxPos + 1;
            }

            // shift columns to the right from insertPos
            TestingColumn::query()
                ->where('board_id', $board->board_id)
                ->where('position', '>=', $insertPos)
                ->increment('position', 1);

            $col = new TestingColumn();
            $col->board_id = $board->board_id;
            $col->name = $name;
            $col->position = $insertPos;
            $col->is_terminal = false;
            $col->created_by_staff_id = $createdByStaffId;
            $col->created_at = now();
            $col->updated_at = now();
            $col->save();

            return $col;
        });
    }

    public function deleteColumn(int $columnId): void
    {
        DB::transaction(function () use ($columnId) {
            /** @var TestingColumn $col */
            $col = TestingColumn::query()->findOrFail($columnId);
            $boardId = (int) $col->board_id;
            $pos = (int) $col->position;

            // delete
            $col->delete();

            // shift left to fill the gap
            TestingColumn::query()
                ->where('board_id', $boardId)
                ->where('position', '>', $pos)
                ->decrement('position', 1);
        });
    }
}
