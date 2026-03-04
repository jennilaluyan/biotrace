<?php

namespace App\Services;

use App\Models\TestingBoard;
use App\Models\TestingColumn;
use Illuminate\Support\Facades\DB;

class TestingBoardColumnsService
{
    /**
     * Rename a column.
     */
    public function renameColumn(int $columnId, string $name): TestingColumn
    {
        /** @var TestingColumn $col */
        $col = TestingColumn::query()->findOrFail($columnId);
        $col->name = $name;
        $col->save();

        return $col;
    }

    /**
     * Add a new column into a board.
     *
     * IMPORTANT (PostgreSQL):
     * - We enforce unique(board_id, position).
     * - A naive "increment position for rows >= X" can collide mid-update:
     *   Postgres checks the unique constraint per-row during UPDATE execution.
     *
     * To avoid collisions, we do a two-phase shift:
     * 1) "Bump" affected positions far away (position += bump)
     * 2) Normalize them back into the final shifted range (position = position - bump + 1)
     *
     * Positions are treated as 1-based: 1..N.
     */
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

            $boardId = (int) $board->board_id;

            /**
             * Lock all existing columns for this board to prevent concurrent inserts/reorders
             * from producing inconsistent position reads inside the same board.
             *
             * Board columns are small in count, so this is acceptable and keeps logic safe.
             */
            $this->lockBoardColumns($boardId);

            $maxPos = $this->getMaxPosition($boardId);

            // Resolve desired insert position (1-based)
            $insertPos = $this->resolveInsertPosition(
                boardId: $boardId,
                maxPos: $maxPos,
                position: $position,
                relativeToColumnId: $relativeToColumnId,
                side: $side
            );

            // If inserting inside existing range, shift everything >= insertPos to the right safely.
            if ($insertPos <= $maxPos) {
                $this->shiftRightFrom($boardId, $insertPos, $maxPos);
            }

            $now = now();

            $col = new TestingColumn();
            $col->board_id = $boardId;
            $col->name = $name;
            $col->position = $insertPos;
            $col->is_terminal = false;
            $col->created_by_staff_id = $createdByStaffId;
            $col->created_at = $now;
            $col->updated_at = $now;
            $col->save();

            return $col;
        });
    }

    /**
     * Delete one column and close the gap in positions.
     *
     * This is safe because we delete the row at $pos first, so decrementing positions > $pos
     * won't collide with an existing row holding that target position.
     */
    public function deleteColumn(int $columnId): void
    {
        DB::transaction(function () use ($columnId) {
            /** @var TestingColumn $col */
            $col = TestingColumn::query()->findOrFail($columnId);

            $boardId = (int) $col->board_id;
            $pos = (int) $col->position;

            // Lock board columns to avoid concurrent reorder/insert while deleting.
            $this->lockBoardColumns($boardId);

            // Delete target column first to free its position.
            $col->delete();

            // Shift left to fill the gap.
            TestingColumn::query()
                ->where('board_id', $boardId)
                ->where('position', '>', $pos)
                ->decrement('position', 1);
        });
    }

    /**
     * Resolve insert position (1-based) using either:
     * - explicit position
     * - relative column (left/right)
     * - append at end
     */
    private function resolveInsertPosition(
        int $boardId,
        int $maxPos,
        ?int $position,
        ?int $relativeToColumnId,
        ?string $side
    ): int {
        $insertPos = null;

        if ($position !== null) {
            $insertPos = (int) $position;
        } elseif ($relativeToColumnId !== null) {
            /** @var TestingColumn $ref */
            $ref = TestingColumn::query()->findOrFail($relativeToColumnId);

            if ((int) $ref->board_id !== $boardId) {
                abort(422, 'relative_to_column_id is not in the same board.');
            }

            $refPos = (int) $ref->position;
            $insertPos = ($side === 'left') ? $refPos : ($refPos + 1);
        }

        // Append if nothing specified
        if ($insertPos === null) {
            return $maxPos + 1;
        }

        // Clamp into [1, maxPos+1]
        if ($insertPos < 1) {
            return 1;
        }

        $maxAllowed = $maxPos + 1;
        if ($insertPos > $maxAllowed) {
            return $maxAllowed;
        }

        return $insertPos;
    }

    /**
     * Lock all columns for a board (FOR UPDATE) inside the transaction.
     */
    private function lockBoardColumns(int $boardId): void
    {
        TestingColumn::query()
            ->where('board_id', $boardId)
            ->select(['column_id'])
            ->lockForUpdate()
            ->get();
    }

    /**
     * Get the current max position for a board (1-based), returns 0 if empty.
     */
    private function getMaxPosition(int $boardId): int
    {
        $max = TestingColumn::query()
            ->where('board_id', $boardId)
            ->max('position');

        return (int) ($max ?? 0);
    }

    /**
     * Shift all columns with position >= $fromPos one step to the right,
     * using a two-phase bump to avoid unique(board_id, position) collisions in Postgres.
     */
    private function shiftRightFrom(int $boardId, int $fromPos, int $maxPos): void
    {
        $affectedCount = (int) TestingColumn::query()
            ->where('board_id', $boardId)
            ->where('position', '>=', $fromPos)
            ->count();

        if ($affectedCount <= 0) {
            return;
        }

        /**
         * Choose a bump that guarantees bumped positions will not overlap any existing range.
         * Example: maxPos=4, affectedCount=4 => bump=18, positions 1..4 => 19..22 temporarily.
         */
        $bump = $maxPos + $affectedCount + 10;

        // Phase 1: bump away to free the target range.
        TestingColumn::query()
            ->where('board_id', $boardId)
            ->where('position', '>=', $fromPos)
            ->update(['position' => DB::raw('position + ' . $bump)]);

        // Phase 2: normalize bumped rows back into the final shifted range (+1 net).
        $minBumped = $fromPos + $bump;
        $maxBumped = $maxPos + $bump;

        TestingColumn::query()
            ->where('board_id', $boardId)
            ->whereBetween('position', [$minBumped, $maxBumped])
            ->update(['position' => DB::raw('position - ' . $bump . ' + 1')]);
    }
}
