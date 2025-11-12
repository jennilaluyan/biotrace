<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $table = Schema::hasTable('staffs') ? 'staffs' : 'users';

        $hasFullName = Schema::hasColumn($table, 'full_name');
        $hasName     = Schema::hasColumn($table, 'name');
        $hasEmail    = Schema::hasColumn($table, 'email');
        $hasPwdHash  = Schema::hasColumn($table, 'password_hash');
        $hasPassword = Schema::hasColumn($table, 'password');
        $hasActive   = Schema::hasColumn($table, 'is_active');
        $hasRoleId   = Schema::hasColumn($table, 'role_id');

        // Map role_id by role name from roles table
        // ['Client' => 1, 'Administrator' => 2, ...] sesuai RoleSeeder
        $roleIdByName = DB::table('roles')
            ->pluck('role_id', 'name')
            ->toArray();

        $makeRow = function (
            string $displayName,
            string $email,
            ?string $roleName
        ) use (
            $hasFullName,
            $hasName,
            $hasEmail,
            $hasPwdHash,
            $hasPassword,
            $hasActive,
            $hasRoleId,
            $roleIdByName
        ) {
            $row = [
                'created_at' => now(),
                'updated_at' => now(),
            ];

            // Name
            if ($hasFullName) {
                $row['full_name'] = $displayName;
            } elseif ($hasName) {
                $row['name'] = $displayName;
            }

            // Email
            if ($hasEmail) {
                $row['email'] = $email;
            }

            // Password
            $hashed = Hash::make('P@ssw0rd!');
            if ($hasPwdHash) {
                $row['password_hash'] = $hashed;
            } elseif ($hasPassword) {
                $row['password'] = $hashed;
            }

            // Active flag
            if ($hasActive) {
                $row['is_active'] = true;
            }

            // Single-role via role_id
            if ($hasRoleId && $roleName !== null) {
                $row['role_id'] = $roleIdByName[$roleName] ?? null;
            }

            return $row;
        };

        // Sesuaikan nama ROLE dengan 'name' di RoleSeeder
        $rows = [
            $makeRow('Client Demo',              'client@lims.local',             'Client'),
            $makeRow('Administrator Demo',       'admin@lims.local',              'Administrator'),
            $makeRow('Sample Collector Demo',    'samplecollector@lims.local',    'Sample Collector'),
            $makeRow('Analyst Demo',             'analyst@lims.local',            'Analyst'),
            $makeRow('Operational Manager Demo', 'operationalmanager@lims.local', 'Operational Manager'),
            $makeRow('Laboratory Head Demo',     'labhead@lims.local',            'Laboratory Head'),
        ];

        if ($hasRoleId) {
            foreach ($rows as $r) {
                if (!array_key_exists('role_id', $r) || $r['role_id'] === null) {
                    throw new \RuntimeException(
                        'Missing role_id while seeding users. Check RoleSeeder role names.'
                    );
                }
            }
        }

        if ($hasEmail) {
            $updateColumns = array_keys($rows[0]);
            $updateColumns = array_values(array_filter($updateColumns, fn($c) => $c !== 'created_at'));
            DB::table($table)->upsert($rows, ['email'], $updateColumns);
        } else {
            foreach ($rows as $row) {
                DB::table($table)->insert($row);
            }
        }
    }
}
