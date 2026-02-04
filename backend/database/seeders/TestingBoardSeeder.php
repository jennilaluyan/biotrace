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
                // 1) Upsert board per workflow group
                $boardId = DB::table('testing_boards')->where('workflow_group', $workflowGroup)->value('board_id');

                $displayName = 'Testing Board - ' . Str::of($workflowGroup)->replace('_', ' ');

                if (!$boardId) {
                    $boardId = DB::table('testing_boards')->insertGetId([
                        'workflow_group' => $workflowGroup,
                        'name' => $displayName,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ], 'board_id');
                } else {
                    DB::table('testing_boards')->where('board_id', $boardId)->update([
                        'name' => $displayName,
                        'updated_at' => now(),
                    ]);
                }

                // 2) Reset columns (repeatable)
                DB::table('testing_columns')->where('board_id', $boardId)->delete();

                // 3) Insert default columns
                foreach (array_values($columns) as $idx => $colName) {
                    DB::table('testing_columns')->insert([
                        'board_id' => $boardId,
                        'name' => $colName,
                        'position' => $idx + 1,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        });
    }
}
