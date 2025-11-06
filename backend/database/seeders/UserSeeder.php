<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Detect table names
        $table = Schema::hasTable('staffs') ? 'staffs' : 'users';

        // Detect available columns
        $hasFullName = Schema::hasColumn($table, 'full_name');
        $hasName = Schema::hasColumn($table, 'name');
        $hasEmail = Schema::hasColumn($table, 'email');
        $hasPwdHash = Schema::hasColumn($table, 'password_hash');
        $hasPassword = Schema::hasColumn($table, 'password');
        $hasActive = Schema::hasColumn($table, 'is_active');

        // Helper to build a row that matches the schema
        $makeRow = function (string $displayName, string $email, string $plain = 'P@ssw0rd!') use (
            $hasFullName,
            $hasName,
            $hasEmail,
            $hasPwdHash,
            $hasPassword,
            $hasActive
        ) {
            $row = [
                'created_at' => now(),
                'updated_at' => now()
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
            $hashed = Hash::make($plain);
            if ($hasPwdHash) {
                $row['password_hash'] = $hashed;
            } elseif ($hasPassword) {
                $row['password'] = $hashed;
            }

            // Activation flag
            if ($hasActive) {
                $row['is_active'] = true;
            }

            return $row;
        };

        // Define 6 users, password for all = 'P@ssw0rd!'
        $rows = [
            $makeRow('Client', 'client@lims.local'),
            $makeRow('Admin', 'admin@lims.local'),
            $makeRow('Sample Collector', 'samplecollector@lims.local'),
            $makeRow('Analyst', 'analyst@lims.local'),
            $makeRow('Operational Manager', 'operationalmanager@lims.local'),
            $makeRow('Laboratory Head', 'labhead@lims.local'),
        ];

        // Upsert by email
        if ($hasEmail) {
            $updateColumns = array_keys($rows[0]);
            $updateColumns = array_values(array_filter($updateColumns, fn($c) => $c !== 'created_at'));

            DB::table($table)->upsert(
                $rows,
                ['email'],
                $updateColumns
            );
        } else {
            foreach ($rows as $row) {
                DB::table($table)->insert($row);
            }
        }
    }
}
