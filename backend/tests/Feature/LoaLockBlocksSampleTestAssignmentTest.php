<?php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LoaLockBlocksSampleTestAssignmentTest extends TestCase
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

    private function createSamplePhysicallyReceived(int $staffId): int
    {
        $clientId = $this->createClientId();

        $payload = [
            'client_id'               => $clientId,
            'request_status'          => 'physically_received',
            'submitted_at'            => now(),
            'physically_received_at'  => now(),
            'current_status'          => 'received',
            'received_at'             => now(),
            'sample_type'             => 'routine',
            'priority'                => 0,
            'created_by'              => $staffId,
            'assigned_to'             => $staffId,
            'created_at'              => now(),
            'updated_at'              => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('samples'));
        DB::table('samples')->insert(array_intersect_key($payload, $cols));

        return (int) DB::table('samples')->orderByDesc('sample_id')->value('sample_id');
    }

    /**
     * Parse allowed values from a PostgreSQL CHECK constraint that uses ARRAY[...] or IN ('a','b').
     */
    private function pgCheckAllowedValues(string $table, string $constraint): ?array
    {
        if (DB::getDriverName() !== 'pgsql') return null;

        try {
            $def = DB::selectOne("
                SELECT pg_get_constraintdef(c.oid) AS def
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                WHERE c.conname = ? AND t.relname = ?
                LIMIT 1
            ", [$constraint, $table]);

            $txt = (string) ($def->def ?? '');
            if ($txt === '') return null;

            $vals = [];

            // Pattern 1: ARRAY['a'::..., 'b'::...]
            if (preg_match('/ARRAY\\[(.*?)\\]/', $txt, $m)) {
                preg_match_all("/'([^']+)'/", (string) $m[1], $mm);
                $vals = $mm[1] ?? [];
            }

            // Pattern 2: IN ('a','b',...)
            if (empty($vals) && preg_match('/\\bIN\\s*\\((.*?)\\)/i', $txt, $m2)) {
                preg_match_all("/'([^']+)'/", (string) $m2[1], $mm2);
                $vals = $mm2[1] ?? [];
            }

            $vals = array_values(array_unique(array_filter($vals, fn($v) => $v !== '')));
            return $vals ?: null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function pickAllowedParameterStatus(): string
    {
        $vals = $this->pgCheckAllowedValues('parameters', 'chk_parameters_status');

        if ($vals) {
            foreach ($vals as $v) {
                if (strtolower($v) === 'active') return $v;
            }
            return $vals[0];
        }

        return 'active';
    }

    private function pickAllowedParameterTag(): string
    {
        $vals = $this->pgCheckAllowedValues('parameters', 'chk_parameters_tag');

        if ($vals) {
            $prefer = ['default', 'general', 'routine', 'umum', 'regular', 'basic'];
            foreach ($prefer as $p) {
                foreach ($vals as $v) {
                    if (strtolower($v) === $p) return $v;
                }
            }
            return $vals[0];
        }

        return 'default';
    }

    private function guessParameterValue(string $column, string $dataType, int $staffId): mixed
    {
        $c = strtolower($column);
        $t = strtolower($dataType);

        if ($c === 'parameter_id') return null;

        // FK creator
        if ($c === 'created_by' || str_ends_with($c, '_by')) return $staffId;

        // common required fields
        if ($c === 'code') return 'P-' . strtoupper(substr(uniqid(), -8));
        if ($c === 'name' || $c === 'parameter_name') return 'Param ' . uniqid();
        if ($c === 'unit') return 'unit';

        // Respect CHECK constraints
        if ($c === 'status') return $this->pickAllowedParameterStatus();
        if ($c === 'tag')    return $this->pickAllowedParameterTag();

        // timestamps
        if (str_contains($t, 'timestamp') || str_contains($t, 'date') || str_contains($t, 'time')) return now();

        // booleans
        if (str_contains($t, 'boolean')) return false;

        // numbers
        if (
            str_contains($t, 'int') ||
            str_contains($t, 'numeric') ||
            str_contains($t, 'decimal') ||
            str_contains($t, 'double') ||
            str_contains($t, 'real')
        ) {
            return 0;
        }

        // fallback string (should be safe for non-constrained text fields)
        return 'x';
    }

    private function createParameter(int $staffId): int
    {
        $cols = array_flip(Schema::getColumnListing('parameters'));

        // base payload (expanded for NOT NULL columns)
        $insert = [
            'code'       => 'P-' . strtoupper(substr(uniqid(), -8)),
            'name'       => 'Param ' . uniqid(),
            'unit'       => 'unit',
            'status'     => $this->pickAllowedParameterStatus(),
            'tag'        => $this->pickAllowedParameterTag(),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        // handle schema variant: parameter_name vs name
        if (isset($cols['parameter_name'])) {
            $insert['parameter_name'] = $insert['name'];
            unset($insert['name']);
        }

        // FK creator
        if (isset($cols['created_by'])) {
            $insert['created_by'] = $staffId;
        }

        // fill any NOT NULL columns dynamically (Postgres)
        try {
            $required = DB::table('information_schema.columns')
                ->select('column_name', 'data_type')
                ->where('table_schema', 'public')
                ->where('table_name', 'parameters')
                ->where('is_nullable', 'NO')
                ->get();

            foreach ($required as $col) {
                $name = (string) $col->column_name;
                if ($name === 'parameter_id') continue;

                if (!array_key_exists($name, $insert) || $insert[$name] === null) {
                    $insert[$name] = $this->guessParameterValue($name, (string) $col->data_type, $staffId);
                }
            }
        } catch (\Throwable $e) {
            // ignore
        }

        $insert = array_intersect_key($insert, $cols);

        DB::table('parameters')->insert($insert);

        return (int) DB::table('parameters')->orderByDesc('parameter_id')->value('parameter_id');
    }

    private function createLoa(int $sampleId, string $status): void
    {
        $cols = array_flip(Schema::getColumnListing('letters_of_order'));

        $payload = [
            'sample_id'     => $sampleId,
            'number'        => 'BA-' . now()->format('Ymd') . '-' . uniqid(),
            'generated_at'  => now(),
            'file_url'      => '/dummy.pdf',
            'loa_status'    => $status,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        DB::table('letters_of_order')->insert(array_intersect_key($payload, $cols));
    }

    public function test_bulk_assignment_blocked_when_loa_missing(): void
    {
        $analyst = $this->createStaff('Analyst', 'analyst_' . uniqid() . '@test.local');
        Sanctum::actingAs($analyst, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $analyst->staff_id);
        $paramId  = $this->createParameter((int) $analyst->staff_id);

        $res = $this->postJson("/api/v1/samples/{$sampleId}/sample-tests/bulk", [
            'tests' => [
                ['parameter_id' => $paramId],
            ],
        ]);

        $res->assertStatus(403);
        $this->assertDatabaseMissing('sample_tests', [
            'sample_id'    => $sampleId,
            'parameter_id' => $paramId,
        ]);
    }

    public function test_bulk_assignment_blocked_when_loa_not_locked(): void
    {
        $analyst = $this->createStaff('Analyst', 'analyst2_' . uniqid() . '@test.local');
        Sanctum::actingAs($analyst, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $analyst->staff_id);
        $paramId  = $this->createParameter((int) $analyst->staff_id);

        $this->createLoa($sampleId, 'sent_to_client');

        $res = $this->postJson("/api/v1/samples/{$sampleId}/sample-tests/bulk", [
            'tests' => [
                ['parameter_id' => $paramId],
            ],
        ]);

        $res->assertStatus(403);
        $this->assertDatabaseMissing('sample_tests', [
            'sample_id'    => $sampleId,
            'parameter_id' => $paramId,
        ]);
    }

    public function test_bulk_assignment_allowed_when_loa_locked(): void
    {
        $analyst = $this->createStaff('Analyst', 'analyst3_' . uniqid() . '@test.local');
        Sanctum::actingAs($analyst, ['*']);

        $sampleId = $this->createSamplePhysicallyReceived((int) $analyst->staff_id);
        $paramId  = $this->createParameter((int) $analyst->staff_id);

        $this->createLoa($sampleId, 'locked');

        $res = $this->postJson("/api/v1/samples/{$sampleId}/sample-tests/bulk", [
            'tests' => [
                ['parameter_id' => $paramId],
            ],
        ]);

        $res->assertStatus(200);

        $this->assertDatabaseHas('sample_tests', [
            'sample_id'    => $sampleId,
            'parameter_id' => $paramId,
        ]);
    }
}
