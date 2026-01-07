<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ReportSignatureRoleSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            /**
             * Legacy cleanup:
             * dulu sempat ada QA_MANAGER, sekarang tidak dipakai lagi.
             * Karena FK report_signatures.role_code RESTRICT, kita harus
             * hapus child rows dulu sebelum hapus role_code di parent table.
             */
            $legacyRoleCodes = ['QA_MANAGER'];

            // 1) delete signatures referencing legacy roles
            DB::table('report_signatures')
                ->whereIn('role_code', $legacyRoleCodes)
                ->delete();

            // 2) delete legacy roles themselves (kalau ada)
            DB::table('report_signature_roles')
                ->whereIn('role_code', $legacyRoleCodes)
                ->delete();

            // 3) seed current roles: OM + LH
            DB::table('report_signature_roles')->upsert([
                [
                    'role_code'   => 'OM',
                    'role_name'   => 'Operational Manager',
                    'sort_order'  => 10,
                    'is_required' => true,
                    'created_at'  => now(),
                    'updated_at'  => null,
                ],
                [
                    'role_code'   => 'LH',
                    'role_name'   => 'Lab Head',
                    'sort_order'  => 20,
                    'is_required' => true,
                    'created_at'  => now(),
                    'updated_at'  => null,
                ],
            ], ['role_code'], ['role_name', 'sort_order', 'is_required', 'updated_at']);
        });
    }
}
