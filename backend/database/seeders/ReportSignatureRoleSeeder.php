<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ReportSignatureRoleSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('report_signature_roles')->upsert([
            [
                'role_code' => 'QA_MANAGER',
                'role_name' => 'QA Manager',
                'sort_order' => 10,
                'is_required' => true,
                'created_at' => now(),
                'updated_at' => null,
            ],
            [
                'role_code' => 'LH',
                'role_name' => 'Lab Head',
                'sort_order' => 20,
                'is_required' => true,
                'created_at' => now(),
                'updated_at' => null,
            ],
        ], ['role_code'], ['role_name', 'sort_order', 'is_required', 'updated_at']);
    }
}
