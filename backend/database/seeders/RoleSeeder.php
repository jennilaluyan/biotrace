<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Using upsert
        $now = now();

        $rows = [
            [
                'code' => 'CLIENT',
                'name' => 'Client',
                'description' => 'Submits testing requests, tracks sample status, and download validated test reports.',
                'created_at' => $now,
                'updated_at' => $now
            ],
            [
                'code' => 'ADMIN',
                'name' => 'Administrator',
                'description' => 'Handles client and sample administration, issues letters of order, prepare test reports.',
                'created_at' => $now,
                'updated_at' => $now
            ],
            [
                'code' => 'SAMPLE_COLLECTOR',
                'name' => 'Sample Collector',
                'description' => 'Receives, inspects, and document incoming samples, triggers reagent calculations after inspection.',
                'created_at' => $now,
                'updated_at' => $now
            ],
            [
                'code' => 'ANALYST',
                'name' => 'Analyst',
                'description' => 'Performs laboratory testing, records raw data, and proposes new parameters or method validations.',
                'created_at' => $now,
                'updated_at' => $now
            ],
            [
                'code' => 'OPERATIONAL_MANAGER',
                'name' => 'Operational Manager',
                'description' => 'Reviews and verifies test results for accuracy before final validation by the lab head.',
                'created_at' => $now,
                'updated_at' => $now
            ],
            [
                'code' => 'LAB_HEAD',
                'name' => 'Laboratory Head',
                'description' => 'Manages users and roles, performs final validation of test results, and approves new parameters and method validation.',
                'created_at' => $now,
                'updated_at' => $now
            ],
        ];

        DB::table('roles')->upsert(
            $rows,
            ['code'],
            ['name', 'description', 'updated_at']
        );
    }
}
