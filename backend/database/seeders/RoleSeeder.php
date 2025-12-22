<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $rows = [
            [
                'role_id' => 1,
                'name' => 'Client',
                'description' => 'Submits testing requests, tracks sample status, and download validated test reports.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'role_id' => 2,
                'name' => 'Administrator',
                'description' => 'Handles client and sample administration, issues letters of order, prepare test reports.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'role_id' => 3,
                'name' => 'Sample Collector',
                'description' => 'Receives, inspects, and document incoming samples, triggers reagent calculations after inspection.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'role_id' => 4,
                'name' => 'Analyst',
                'description' => 'Performs laboratory testing, records raw data, and proposes new parameters or method validations.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'role_id' => 5,
                'name' => 'Operational Manager',
                'description' => 'Reviews and verifies test results for accuracy before final validation by the lab head.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'role_id' => 6,
                'name' => 'Laboratory Head',
                'description' => 'Manages users and roles, performs final validation of test results, and approves new parameters and method validation.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];
        
        DB::table('roles')->upsert(
            $rows,
            ['role_id'],
            ['name', 'description', 'updated_at']
        );        
    }
}