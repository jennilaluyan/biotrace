<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class UserRoleSeeder extends Seeder
{
    public function run(): void
    {
        // Resolve role IDs by stable `code`
        $roleIdByCode = DB::table('roles')
            ->pluck('role_id', 'code')     // ['ADMIN' => 1, 'LAB_HEAD' => 2, ...]
            ->toArray();

        // Map demo emails (from UserSeeder) to target role codes
        $emailToRole = [
            'admin@lims.local'    => 'ADMIN',
            'labhead@lims.local'  => 'LAB_HEAD',
            'om@lims.local'       => 'OPERATIONAL_MANAGER',
            'analyst@lims.local'  => 'ANALYST',
            'sc@lims.local'       => 'SAMPLE_COLLECTOR',
            'client@lims.local'   => 'CLIENT',
        ];

        // Helper to fetch a staff row by email and return its primary key
        $getStaffId = function (string $email): ?int {
            $row = DB::table('staffs')->where('email', $email)->first();
            if (!$row) return null;

            // Detect primary key field name (user_id, staff_id, or id)
            foreach (['user_id', 'staff_id', 'id'] as $key) {
                if (isset($row->{$key})) {
                    return (int) $row->{$key};
                }
            }
            return null;
        };

        // Two assignment strategies
        $hasSingleRoleColumn = Schema::hasColumn('staffs', 'role_id');
        $hasPivotTable       = Schema::hasTable('user_roles');

        foreach ($emailToRole as $email => $roleCode) {
            $roleId  = $roleIdByCode[$roleCode] ?? null;
            $staffId = $getStaffId($email);

            if (!$roleId || !$staffId) {
                continue;
            }

            if ($hasSingleRoleColumn) {
                // Single-role model: update staffs.role_id
                DB::table('staffs')
                    ->where('email', $email)
                    ->update([
                        'role_id'   => $roleId,
                        'updated_at' => now(),
                    ]);
            } elseif ($hasPivotTable) {
                // Many-to-many model: upsert into user_roles
                DB::table('user_roles')->upsert(
                    [[
                        'user_id'     => $staffId,
                        'role_id'     => $roleId,
                        'assigned_at' => now(),
                        'assigned_by' => null,
                    ]],
                    ['user_id', 'role_id'],
                    ['assigned_at']
                );
            } else {
                continue;
            }
        }
    }
}
