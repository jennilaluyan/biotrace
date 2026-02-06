<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Enums\WorkflowGroup;

class TestingBoardSeeder extends Seeder
{
    public function run(): void
    {
        /**
         * Default columns per workflow group.
         *
         * IMPORTANT:
         * - FE punya pilihan: default, pcr_sars_cov_2, pcr, wgs, elisa
         * - Kalau group di DB tidak ada, FE akan fallback, lalu Move pakai column_id dummy (1/2/3)
         *   dan backend akan 422 "Target column does not belong..."
         *
         * Jadi: kita seed semua group yang dipakai FE.
         */
        $defaults = [
            // ✅ UI default (general)
            'default' => [
                'In Testing',
                'Measuring',
                'Ready for Review',
            ],

            // ✅ UI shortcuts
            'pcr' => [
                'Ekstraksi',
                'Mixing',
                'PCR',
            ],
            'wgs' => [
                'Ekstraksi',
                'Library Preparation',
                'Sequencing',
                'Bioinformatics Analysis',
            ],
            'elisa' => [
                'Preparasi Sample',
                'ELISA',
                'Review',
            ],

            // ✅ Enum-based groups (existing)
            WorkflowGroup::PCR_SARS_COV_2->value => [
                'Ekstraksi',
                'Mixing',
                'PCR',
            ],
            WorkflowGroup::WGS_SARS_COV_2->value => [
                'Ekstraksi',
                'Library Preparation',
                'Sequencing',
                'Bioinformatics Analysis',
            ],
            WorkflowGroup::GROUP_19_22->value => [
                'Preparasi Sample',
                'Analysis',
            ],
            WorkflowGroup::GROUP_23_32->value => [
                'Preparasi Sample',
                'Kultur',
                'Analysis Cat.',
            ],
        ];

        DB::transaction(function () use ($defaults) {
            foreach ($defaults as $workflowGroup => $columns) {
                // 1) Upsert board for this workflow_group
                $board = DB::table('testing_boards')
                    ->where('workflow_group', $workflowGroup)
                    ->first();

                if (!$board) {
                    $boardId = DB::table('testing_boards')->insertGetId([
                        'workflow_group' => $workflowGroup,
                        'name' => Str::title(str_replace('_', ' ', $workflowGroup)),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } else {
                    $boardId = $board->board_id;
                }

                // 2) Cleanup safely: delete events first, then columns (FK restrict)
                $columnIds = DB::table('testing_columns')
                    ->where('board_id', $boardId)
                    ->pluck('column_id')
                    ->all();

                if (!empty($columnIds)) {
                    // ✅ testing_card_events di schema kamu pakai to_column_id (dan biasanya from_column_id)
                    $cols = DB::getSchemaBuilder()->getColumnListing('testing_card_events');

                    $q = DB::table('testing_card_events');

                    $hasAny = false;

                    if (in_array('to_column_id', $cols, true)) {
                        $q->whereIn('to_column_id', $columnIds);
                        $hasAny = true;
                    }

                    if (in_array('from_column_id', $cols, true)) {
                        // kalau sudah ada where, lanjut OR; kalau belum, jadi where utama
                        if ($hasAny) {
                            $q->orWhereIn('from_column_id', $columnIds);
                        } else {
                            $q->whereIn('from_column_id', $columnIds);
                            $hasAny = true;
                        }
                    }

                    // fallback kalau ternyata beda nama (jaga-jaga)
                    if (!$hasAny && in_array('column_id', $cols, true)) {
                        $q->whereIn('column_id', $columnIds);
                        $hasAny = true;
                    }

                    if ($hasAny) {
                        $q->delete();
                    }
                }

                DB::table('testing_columns')
                    ->where('board_id', $boardId)
                    ->delete();

                // 3) Insert default columns
                foreach (array_values($columns) as $idx => $colName) {
                    DB::table('testing_columns')->insert([
                        'board_id' => $boardId,
                        'name' => $colName,
                        'position' => $idx + 1, // keep 1-based
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        });
    }
}
