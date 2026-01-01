<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class MethodsSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['name' => 'qPCR',              'description' => 'Quantitative PCR'],
            ['name' => 'RT-qPCR',           'description' => 'Reverse Transcription qPCR'],
            ['name' => 'PCR',               'description' => 'Polymerase Chain Reaction'],
            ['name' => 'ELISA',             'description' => 'Enzyme-linked immunosorbent assay'],
            ['name' => 'Gel Electrophoresis', 'description' => 'Gel electrophoresis'],
        ];

        foreach ($rows as $r) {
            DB::table('methods')->updateOrInsert(
                ['name' => $r['name']],
                [
                    'description' => $r['description'],
                    'is_active'   => true,
                ]
            );
        }
    }
}
