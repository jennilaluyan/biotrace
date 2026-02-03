<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TestingBoardSeeder extends Seeder
{
    public function run(): void
    {
        /**
         * Default columns per workflow group (sesuai definisi kamu).
         *
         * NOTE:
         * - Group naming di DB harus match yang dipakai di samples.workflow_group
         * - Kalau kamu sudah pakai enum WorkflowGroup.php, samakan stringnya di bawah.
         */
        $defaults = [
            // 1) PCR Sars Cov 2 (params 1-11)
            'PCR_SARS_COV_2' => [
                'Ekstraksi',
                'Mixing',
                'PCR',
            ],

            // 2) Whole Genome Sequence Sars Cov 2 (params 12-17)
            'WGS_SARS_COV_2' => [
                'Ekstraksi',
                'Library Preparation',
                'Sequencing',
                'Bioinformatics Analysis',
            ],

            // 3) Parameter 19-22
            'PARAM_19_22' => [
                'Preparasi Sample',
                'Analysis',
            ],

            // 4) Parameter 23-32
            'PARAM_23_32' => [
                'Preparasi Sample',
                'Kultur',
                'Analysis Cat.',
            ],
        ];

        DB::transaction(function () use ($defaults) {
            foreach ($defaults as $workflowGroup => $columns) {
                // 1) Upsert board per workflow group
                // Assumption schema (dari step 10.1): testing_boards punya kolom workflow_group + name
                $boardId = DB::table('testing_boards')->where('workflow_group', $workflowGroup)->value('board_id');

                if (!$boardId) {
                    $boardId = DB::table('testing_boards')->insertGetId([
                        'workflow_group' => $workflowGroup,
                        'name' => 'Testing Board - ' . Str::of($workflowGroup)->replace('_', ' '),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ], 'board_id');
                } else {
                    // ensure name always exists/updated
                    DB::table('testing_boards')->where('board_id', $boardId)->update([
                        'name' => 'Testing Board - ' . Str::of($workflowGroup)->replace('_', ' '),
                        'updated_at' => now(),
                    ]);
                }

                // 2) Reset columns for this board (repeatable seeding)
                DB::table('testing_columns')->where('board_id', $boardId)->delete();

                // 3) Insert default columns in order
                foreach (array_values($columns) as $idx => $colName) {
                    DB::table('testing_columns')->insert([
                        'board_id' => $boardId,
                        'name' => $colName,
                        'position' => $idx + 1, // 1-based
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        });
    }
}
