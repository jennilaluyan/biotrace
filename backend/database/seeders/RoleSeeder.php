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
                'name' => 'Client',
                'description' => 'Submits testing requests, tracks sample status, and download validated test reports.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Administrator',
                'description' => 'Handles client and sample administration, issues letters of order, prepare test reports.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Sample Collector',
                'description' => 'Receives, inspects, and document incoming samples, triggers reagent calculations after inspection.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Analyst',
                'description' => 'Performs laboratory testing, records raw data, and proposes new parameters or method validations.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Operational Manager',
                'description' => 'Reviews and verifies test results for accuracy before final validation by the lab head.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Laboratory Head',
                'description' => 'Manages users and roles, performs final validation of test results, and approves new parameters and method validation.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        DB::table('roles')->upsert(
            $rows,
            ['name'],
            ['description', 'updated_at']
        );
    }
}
