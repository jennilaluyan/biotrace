<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Seed 6 baseline accounts and (if present) populate staffs.role_id.
     * Keeps schema-awareness (staffs/users; full_name/name; password_hash/password).
     */
    public function run(): void
    {
        // Detect table names
        $table = Schema::hasTable('staffs') ? 'staffs' : 'users';

        // Detect available columns
        $hasFullName = Schema::hasColumn($table, 'full_name');
        $hasName     = Schema::hasColumn($table, 'name');
        $hasEmail    = Schema::hasColumn($table, 'email');
        $hasPwdHash  = Schema::hasColumn($table, 'password_hash');
        $hasPassword = Schema::hasColumn($table, 'password');
        $hasActive   = Schema::hasColumn($table, 'is_active');
        $hasRoleId   = Schema::hasColumn($table, 'role_id'); // <-- important for single-role schema

        // Resolve role IDs from master roles (seeded by RoleSeeder)
        // Pluck returns ['ADMIN' => 1, 'LAB_HEAD' => 2, ...]
        $roleIdByCode = DB::table('roles')->pluck('role_id', 'code')->toArray();

        // Helper to build a row that matches the schema, including role_id if present
        $makeRow = function (string $displayName, string $email, ?string $roleCode) use (
            $hasFullName,
            $hasName,
            $hasEmail,
            $hasPwdHash,
            $hasPassword,
            $hasActive,
            $hasRoleId,
            $roleIdByCode
        ) {
            $row = [
                'created_at' => now(),
                'updated_at' => now(),
            ];

            // Name column
            if ($hasFullName) {
                $row['full_name'] = $displayName;
            } elseif ($hasName) {
                $row['name'] = $displayName;
            }

            // Email column
            if ($hasEmail) {
                $row['email'] = $email;
            }

            // Password column
            $hashed = Hash::make('P@ssw0rd!');
            if ($hasPwdHash) {
                $row['password_hash'] = $hashed;
            } elseif ($hasPassword) {
                $row['password'] = $hashed;
            }

            // Activation flag
            if ($hasActive) {
                $row['is_active'] = true;
            }

            // Single-role schema support (staffs.role_id NOT NULL in your DB)
            if ($hasRoleId && $roleCode !== null) {
                $row['role_id'] = $roleIdByCode[$roleCode] ?? null;
            }

            return $row;
        };

        // Define 6 users (+ intended role codes). Password for all = 'P@ssw0rd!'
        $rows = [
            $makeRow('Client',               'client@lims.local',              'CLIENT'),
            $makeRow('Admin',                'admin@lims.local',               'ADMIN'),
            $makeRow('Sample Collector',     'samplecollector@lims.local',     'SAMPLE_COLLECTOR'),
            $makeRow('Analyst',              'analyst@lims.local',             'ANALYST'),
            $makeRow('Operational Manager',  'operationalmanager@lims.local',  'OPERATIONAL_MANAGER'),
            $makeRow('Laboratory Head',      'labhead@lims.local',             'LAB_HEAD'),
        ];

        // Safety check: if role_id is required by schema, ensure it's not null
        if ($hasRoleId) {
            foreach ($rows as $r) {
                if (!array_key_exists('role_id', $r) || $r['role_id'] === null) {
                    throw new \RuntimeException('Missing role_id while seeding users. Ensure RoleSeeder ran and roles.code exist.');
                }
            }
        }

        // Upsert by email (requires staffs.email UNIQUE in migration)
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
