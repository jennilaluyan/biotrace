<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UnitsSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['name' => 'Ct',        'symbol' => 'Ct',     'description' => 'Cycle threshold'],
            ['name' => 'Copies/mL', 'symbol' => 'copies/mL', 'description' => 'Copies per milliliter'],
            ['name' => 'ng/mL',     'symbol' => 'ng/mL',  'description' => 'Nanogram per milliliter'],
            ['name' => 'µL',        'symbol' => 'µL',     'description' => 'Microliter'],
            ['name' => 'mL',        'symbol' => 'mL',     'description' => 'Milliliter'],
            ['name' => 'mg',        'symbol' => 'mg',     'description' => 'Milligram'],
        ];

        foreach ($rows as $r) {
            DB::table('units')->updateOrInsert(
                ['name' => $r['name']],
                [
                    'symbol'      => $r['symbol'],
                    'description' => $r['description'],
                    'is_active'   => true,
                ]
            );
        }
    }
}
