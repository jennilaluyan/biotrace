<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class QCControlsSeeder extends Seeder
{
    public function run(): void
    {
        // kalau table belum ada, skip aman
        if (!DB::getSchemaBuilder()->hasTable('qc_controls')) {
            return;
        }

        // Ambil beberapa parameter pertama (tidak asumsi nama/code)
        $paramIds = DB::table('parameters')
            ->orderBy('parameter_id')
            ->limit(5)
            ->pluck('parameter_id')
            ->all();

        if (count($paramIds) === 0) {
            return;
        }

        $now = now();

        $rows = [];
        foreach ($paramIds as $pid) {
            // MVP: 2 level control material (low/high) → cocok untuk rule R-4s nanti
            $rows[] = [
                'parameter_id' => $pid,
                'method_id' => null,
                'control_type' => 'control_material',
                'target' => 10.000000,
                'tolerance' => 1.000000, // SD
                'ruleset' => json_encode(["1-2s", "1-3s", "R-4s"]),
                'is_active' => true,
                'note' => 'MVP baseline control (LOW)',
                'created_at' => $now,
                'updated_at' => $now,
            ];
            $rows[] = [
                'parameter_id' => $pid,
                'method_id' => null,
                'control_type' => 'control_material',
                'target' => 20.000000,
                'tolerance' => 1.000000, // SD
                'ruleset' => json_encode(["1-2s", "1-3s", "R-4s"]),
                'is_active' => true,
                'note' => 'MVP baseline control (HIGH)',
                'created_at' => $now,
                'updated_at' => $now,
            ];

            // Placeholder readiness untuk ISO-style expansion
            $rows[] = [
                'parameter_id' => $pid,
                'method_id' => null,
                'control_type' => 'blank',
                'target' => null,
                'tolerance' => null,
                'ruleset' => json_encode(["1-2s", "1-3s", "R-4s"]),
                'is_active' => false,
                'note' => 'Placeholder (activate later if needed)',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // Insert kecil biar aman
        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('qc_controls')->insert($chunk);
        }
    }
}
