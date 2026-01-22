<?php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SampleIntakeGateTest extends TestCase
{
    use RefreshDatabase;

    private function ensureRole(string $name): int
    {
        $existing = DB::table('roles')->where('name', $name)->value('role_id');
        if ($existing) return (int) $existing;

        return (int) DB::table('roles')->insertGetId([
            'name'        => $name,
            'description' => 'Auto role for tests',
            'created_at'  => now(),
            'updated_at'  => now(),
        ], 'role_id');
    }

    private function createStaff(string $roleName, string $email): Staff
    {
        $roleId = $this->ensureRole($roleName);

        $payload = [
            'name'          => $roleName . ' User',
            'email'         => $email,
            'password_hash' => bcrypt('password'),
            'role_id'       => $roleId,
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('staffs'));
        DB::table('staffs')->insert(array_intersect_key($payload, $cols));

        $id = (int) DB::table('staffs')->where('email', $email)->value('staff_id');
        return Staff::query()->findOrFail($id);
    }

    private function createClientId(): int
    {
        $payload = [
            'type'          => 'individual',
            'name'          => 'Test Client',
            'email'         => 'client_' . uniqid() . '@test.local',
            'phone'         => '081234567890',
            'password_hash' => bcrypt('password'),
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('clients'));
        DB::table('clients')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('clients')->orderByDesc('client_id')->value('client_id');
    }

    private function guessSampleValue(string $column, string $dataType, int $staffId): mixed
    {
        $c = strtolower($column);
        $t = strtolower($dataType);

        if ($c === 'created_by' || str_ends_with($c, '_by') || $c === 'assigned_to') return $staffId;
        if ($c === 'request_status') return 'submitted';
        if ($c === 'current_status') return 'received';
        if ($c === 'sample_type') return 'routine';
        if ($c === 'priority') return 0;
        if ($c === 'received_at') return now();
        if ($c === 'submitted_at') return now();
        if ($c === 'sample_code') return 'REQ-' . now()->format('YmdHis') . '-' . Str::lower(Str::random(6));

        if (str_contains($t, 'boolean')) return false;
        if (str_contains($t, 'timestamp') || str_contains($t, 'date') || str_contains($t, 'time')) return now();
        if (str_contains($t, 'int') || str_contains($t, 'numeric') || str_contains($t, 'decimal') || str_contains($t, 'double') || str_contains($t, 'real')) return 0;

        return 'test';
    }

    private function createSampleSubmitted(int $staffId): int
    {
        $clientId = $this->createClientId();

        $cols = array_flip(Schema::getColumnListing('samples'));

        $insert = [
            'client_id'      => $clientId,
            'request_status' => 'submitted',
            'submitted_at'   => now(),
            'current_status' => 'received',
            'received_at'    => now(),
            'sample_type'    => 'routine',
            'priority'       => 0,
            'created_by'     => $staffId,
            'assigned_to'    => $staffId,
            'created_at'     => now(),
            'updated_at'     => now(),
        ];

        // Isi kolom NOT NULL lain (Postgres)
        try {
            $required = DB::table('information_schema.columns')
                ->select('column_name', 'data_type')
                ->where('table_schema', 'public')
                ->where('table_name', 'samples')
                ->where('is_nullable', 'NO')
                ->get();

            foreach ($required as $col) {
                $name = (string) $col->column_name;
                if ($name === 'sample_id') continue;

                if (!array_key_exists($name, $insert) || $insert[$name] === null) {
                    $insert[$name] = $this->guessSampleValue($name, (string) $col->data_type, $staffId);
                }
            }
        } catch (\Throwable $e) {
            // ignore
        }

        $insert = array_intersect_key($insert, $cols);
        DB::table('samples')->insert($insert);

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    public function test_lab_workflow_blocked_until_physically_received(): void
    {
        // ADMIN staff (schema-safe, no factory)
        $admin = $this->createStaff('Administrator', 'admin_gate_' . uniqid() . '@test.local');
        Sanctum::actingAs($admin, ['*']);

        // sample masih "submitted" (belum physically_received)
        $sampleId = $this->createSampleSubmitted((int) $admin->staff_id);

        // 1) coba masuk lab workflow -> HARUS DIBLOK
        $this->postJson("/api/v1/samples/{$sampleId}/status", [
            'target_status' => 'in_progress',
            'note'          => 'start lab',
        ])->assertStatus(422);

        // 2) transit request_status step-by-step
        $this->postJson("/api/v1/samples/{$sampleId}/request-status", [
            'target_status' => 'ready_for_delivery',
            'note'          => 'ready to deliver sample',
        ])->assertStatus(200);

        $this->postJson("/api/v1/samples/{$sampleId}/request-status", [
            'target_status' => 'physically_received',
            'note'          => 'sample arrived at lab',
        ])->assertStatus(200);

        // 3) sekarang boleh masuk lab workflow
        $this->postJson("/api/v1/samples/{$sampleId}/status", [
            'target_status' => 'in_progress',
            'note'          => 'start lab after intake complete',
        ])->assertStatus(200);

        // sanity check DB
        $this->assertDatabaseHas('samples', [
            'sample_id'      => $sampleId,
            'request_status' => 'physically_received',
        ]);

        if (Schema::hasColumn('samples', 'physically_received_at')) {
            $this->assertNotNull(
                DB::table('samples')->where('sample_id', $sampleId)->value('physically_received_at'),
                'Expected physically_received_at to be set.'
            );
        }
    }
}
