<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClientSampleRequestApiTest extends TestCase
{
    use RefreshDatabase;

    private ?int $baselineRoleId = null;
    private ?int $baselineStaffId = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBaselineRoleAndStaff(); // cegah FK hardcode role_id=1 / staff_id=1
    }

    /**
     * Postgres-only: setelah insert manual PK (mis: staff_id=1),
     * sequence sering "ketinggalan" dan masih mau generate 1 lagi.
     * Ini yang bikin duplicate key staffs_pkey.
     */
    private function syncPgSequence(string $table, string $column): void
    {
        try {
            // Dapatkan nama sequence yang dipakai kolom ini (kalau serial/identity)
            $row = DB::selectOne("select pg_get_serial_sequence(?, ?) as seq", [$table, $column]);
            $seq = $row->seq ?? null;

            if (!$seq) return;

            // Set sequence ke max(column) biar nextval aman (max+1)
            DB::statement("select setval(?, (select coalesce(max($column), 1) from $table), true)", [$seq]);
        } catch (\Throwable $e) {
            // kalau bukan PG / tidak ada serial sequence, ignore
        }
    }

    /**
     * Baseline safety:
     * - Pastikan roles punya row role_id=1
     * - Pastikan staffs punya row staff_id=1 (role_id=1)
     *
     * Plus: sinkronkan sequence supaya insert berikutnya tidak bentrok.
     */
    protected function seedBaselineRoleAndStaff(): void
    {
        // --- Roles ---
        if (Schema::hasTable('roles')) {
            $rolePk = Schema::hasColumn('roles', 'role_id')
                ? 'role_id'
                : (Schema::hasColumn('roles', 'id') ? 'id' : null);

            if ($rolePk) {
                $exists = DB::table('roles')->where($rolePk, 1)->exists();

                if (!$exists) {
                    $payload = [
                        $rolePk       => 1,
                        'name'        => 'ADMIN',
                        'description' => 'Baseline role for tests',
                        'created_at'  => now(),
                        'updated_at'  => now(),
                    ];

                    $cols = array_flip(Schema::getColumnListing('roles'));
                    $insert = array_intersect_key($payload, $cols);

                    if (!isset($insert['name']) && isset($cols['name'])) {
                        $insert['name'] = 'ADMIN';
                    }

                    DB::table('roles')->insert($insert);
                }

                $this->baselineRoleId = 1;

                // penting: sync sequence kalau rolePk adalah serial (role_id)
                if ($rolePk === 'role_id') {
                    $this->syncPgSequence('roles', 'role_id');
                }
            }
        }

        // --- Staffs ---
        if (Schema::hasTable('staffs')) {
            $staffPk = Schema::hasColumn('staffs', 'staff_id')
                ? 'staff_id'
                : (Schema::hasColumn('staffs', 'id') ? 'id' : null);

            if ($staffPk) {
                $exists = DB::table('staffs')->where($staffPk, 1)->exists();

                if (!$exists) {
                    $payload = [
                        $staffPk        => 1,
                        'name'          => 'Baseline Staff',
                        'email'         => 'baseline_staff@test.local',
                        'password_hash' => bcrypt('secret'),
                        'password'      => bcrypt('secret'),
                        'role_id'       => 1,
                        'is_active'     => true,
                        'created_at'    => now(),
                        'updated_at'    => now(),
                    ];

                    $cols = array_flip(Schema::getColumnListing('staffs'));
                    $insert = array_intersect_key($payload, $cols);

                    if (isset($cols['role_id']) && !isset($insert['role_id'])) $insert['role_id'] = 1;
                    if (isset($cols['is_active']) && !isset($insert['is_active'])) $insert['is_active'] = true;
                    if (isset($cols['password_hash']) && !isset($insert['password_hash'])) $insert['password_hash'] = bcrypt('secret');
                    if (isset($cols['created_at']) && !isset($insert['created_at'])) $insert['created_at'] = now();
                    if (isset($cols['updated_at']) && !isset($insert['updated_at'])) $insert['updated_at'] = now();

                    DB::table('staffs')->insert($insert);
                }

                $this->baselineStaffId = 1;

                // INI KUNCI: sync sequence supaya insert staff berikutnya tidak pakai 1 lagi
                if ($staffPk === 'staff_id') {
                    $this->syncPgSequence('staffs', 'staff_id');
                }
            }
        }
    }

    /**
     * Helper: ensure role row exists (by name), returns role_id.
     */
    private function ensureRole(string $name): int
    {
        if (!Schema::hasTable('roles')) {
            $this->fail('roles table not found.');
        }

        $rolePk = Schema::hasColumn('roles', 'role_id')
            ? 'role_id'
            : (Schema::hasColumn('roles', 'id') ? 'id' : null);

        if (!$rolePk) {
            $this->fail('Expected roles PK column not found (role_id/id).');
        }

        $existing = DB::table('roles')->where('name', $name)->value($rolePk);
        if ($existing) return (int) $existing;

        $payload = [
            'name'        => $name,
            'description' => 'Auto role for tests',
            'created_at'  => now(),
            'updated_at'  => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('roles'));
        $insert = array_intersect_key($payload, $cols);

        $id = DB::table('roles')->insertGetId($insert, $rolePk);

        // jaga-jaga sequence roles juga rapi
        if ($rolePk === 'role_id') {
            $this->syncPgSequence('roles', 'role_id');
        }

        return (int) $id;
    }

    /**
     * Helper: create Staff manually (schema-safe).
     */
    private function createStaff(string $roleName, string $email): Staff
    {
        if (!Schema::hasTable('staffs')) {
            $this->fail('staffs table not found.');
        }

        $staffPk = Schema::hasColumn('staffs', 'staff_id')
            ? 'staff_id'
            : (Schema::hasColumn('staffs', 'id') ? 'id' : null);

        if (!$staffPk) {
            $this->fail('Expected staffs PK column not found (staff_id/id).');
        }

        $roleId = $this->ensureRole($roleName);

        $payload = [
            'name'          => $roleName . ' User',
            'email'         => $email,
            'password_hash' => bcrypt('password'),
            'password'      => bcrypt('password'),
            'role_id'       => $roleId,
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('staffs'));
        $insert = array_intersect_key($payload, $cols);

        DB::table('staffs')->insert($insert);

        // jaga-jaga sequence staff tetap sehat
        if ($staffPk === 'staff_id') {
            $this->syncPgSequence('staffs', 'staff_id');
        }

        $staffId = (int) DB::table('staffs')->where('email', $email)->value($staffPk);
        return Staff::query()->findOrFail($staffId);
    }

    private function guessValueForColumn(string $column, string $dataType, string $baseEmail)
    {
        $c = strtolower($column);
        $t = strtolower($dataType);

        if ($c === 'created_by' || str_ends_with($c, '_by') || $c === 'assigned_to') {
            return $this->baselineStaffId ?? 1;
        }

        if ($c === 'current_status') return 'received';
        if ($c === 'request_status') return 'draft';
        if ($c === 'sample_type') return 'individual';

        if (str_contains($c, 'email')) return $baseEmail;
        if (str_contains($c, 'name')) return 'Test ' . ucfirst($column);
        if (str_contains($c, 'phone') || str_contains($c, 'tel')) return '081234567890';
        if (str_contains($c, 'address')) return 'Test Address';

        if ($c === 'status' || str_contains($c, 'status')) return 'active';

        if (str_contains($c, 'active')) return true;
        if (str_contains($c, 'password')) return bcrypt('password');
        if (str_contains($c, 'code')) return strtoupper(substr($column, 0, 1)) . '-' . uniqid();

        if (str_contains($t, 'boolean')) return false;
        if (str_contains($t, 'timestamp') || str_contains($t, 'date') || str_contains($t, 'time')) return now();
        if (str_contains($t, 'int') || str_contains($t, 'numeric') || str_contains($t, 'double') || str_contains($t, 'real') || str_contains($t, 'decimal')) return 0;

        return 'test';
    }

    private function createClient(string $email): Client
    {
        if (!Schema::hasTable('clients')) {
            $this->fail('clients table not found.');
        }

        $pk = Schema::hasColumn('clients', 'client_id')
            ? 'client_id'
            : (Schema::hasColumn('clients', 'id') ? 'id' : null);

        if (!$pk) {
            $this->fail('Expected clients PK column not found (client_id/id).');
        }

        $payload = [
            'client_code'      => 'C-' . uniqid(),
            'name'             => 'Test Client ' . uniqid(),
            'email'            => $email,
            'phone'            => '081234567890',
            'type'             => 'individual',
            'institution_name' => 'Test Institution',
            'is_active'        => true,
            'staff_id'         => $this->baselineStaffId ?? 1,
            'password_hash'    => bcrypt('password'),
            'password'         => bcrypt('password'),
            'created_at'       => now(),
            'updated_at'       => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('clients'));
        $insert = array_intersect_key($payload, $cols);

        try {
            $required = DB::table('information_schema.columns')
                ->select('column_name', 'data_type')
                ->where('table_schema', 'public')
                ->where('table_name', 'clients')
                ->where('is_nullable', 'NO')
                ->get();

            foreach ($required as $col) {
                $name = (string) $col->column_name;
                if ($name === $pk) continue;

                if (!array_key_exists($name, $insert) || $insert[$name] === null) {
                    $insert[$name] = $this->guessValueForColumn($name, (string) $col->data_type, $email);
                }
            }

            $insert = array_intersect_key($insert, $cols);
        } catch (\Throwable $e) {
            // ignore
        }

        DB::table('clients')->insert($insert);

        $clientId = (int) DB::table('clients')->orderByDesc($pk)->value($pk);
        return Client::query()->findOrFail($clientId);
    }

    private function createSampleForClient(int $clientId, string $requestStatus): int
    {
        if (!Schema::hasTable('samples')) {
            $this->fail('samples table not found.');
        }

        $samplePk = Schema::hasColumn('samples', 'sample_id')
            ? 'sample_id'
            : (Schema::hasColumn('samples', 'id') ? 'id' : null);

        if (!$samplePk) {
            $this->fail('Expected samples PK column not found (sample_id/id).');
        }

        $cols = array_flip(Schema::getColumnListing('samples'));
        $baseEmail = 'sample_' . uniqid() . '@test.local';

        $insert = [
            'client_id'      => $clientId,
            'request_status' => $requestStatus,
            'created_at'     => now(),
            'updated_at'     => now(),
        ];

        if (isset($cols['sample_code'])) {
            $insert['sample_code'] = 'REQ-' . now()->format('YmdHis') . '-' . uniqid();
        }
        if (isset($cols['sample_type'])) $insert['sample_type'] = 'individual';
        if (isset($cols['current_status'])) $insert['current_status'] = 'received';
        if (isset($cols['priority'])) $insert['priority'] = 0;
        if ($requestStatus === 'submitted' && isset($cols['submitted_at'])) {
            $insert['submitted_at'] = now();
        }

        if (isset($cols['created_by'])) $insert['created_by'] = $this->baselineStaffId ?? 1;
        if (isset($cols['assigned_to'])) $insert['assigned_to'] = $this->baselineStaffId ?? 1;

        try {
            $required = DB::table('information_schema.columns')
                ->select('column_name', 'data_type')
                ->where('table_schema', 'public')
                ->where('table_name', 'samples')
                ->where('is_nullable', 'NO')
                ->get();

            foreach ($required as $col) {
                $name = (string) $col->column_name;
                if ($name === $samplePk) continue;

                if (!array_key_exists($name, $insert) || $insert[$name] === null) {
                    if ($name === 'request_status') {
                        $insert[$name] = $requestStatus;
                        continue;
                    }

                    if (str_ends_with(strtolower($name), '_by') || $name === 'assigned_to') {
                        $insert[$name] = $this->baselineStaffId ?? 1;
                        continue;
                    }

                    $insert[$name] = $this->guessValueForColumn($name, (string) $col->data_type, $baseEmail);
                }
            }

            $insert = array_intersect_key($insert, $cols);
        } catch (\Throwable $e) {
            // ignore
        }

        $insert = array_intersect_key($insert, $cols);
        DB::table('samples')->insert($insert);

        return (int) DB::table('samples')->orderByDesc($samplePk)->value($samplePk);
    }

    public function test_client_can_create_draft_request(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $res = $this->postJson('/api/v1/client/samples', [
            'notes' => 'please test this sample',
        ]);

        $res->assertStatus(201);

        $json = $res->json('data');
        $this->assertNotEmpty($json, 'Expected response data payload.');

        $sampleId = (int) ($json['sample_id'] ?? $json['id'] ?? 0);
        $this->assertTrue($sampleId > 0, 'Expected sample_id in response.');

        $this->assertDatabaseHas('samples', [
            'sample_id'      => $sampleId,
            'client_id'      => (int) ($client->client_id ?? $client->getKey()),
            'request_status' => 'draft',
        ]);
    }

    public function test_client_can_submit_draft_request(): void
    {
        $client = $this->createClient('client_' . uniqid() . '@test.local');
        Sanctum::actingAs($client, ['*']);

        $clientId = (int) ($client->client_id ?? $client->getKey());
        $sampleId = $this->createSampleForClient($clientId, 'draft');

        $res = $this->postJson("/api/v1/client/samples/{$sampleId}/submit", []);
        $res->assertStatus(200);

        $this->assertDatabaseHas('samples', [
            'sample_id'      => $sampleId,
            'request_status' => 'submitted',
        ]);

        if (Schema::hasColumn('samples', 'submitted_at')) {
            $this->assertNotNull(
                DB::table('samples')->where('sample_id', $sampleId)->value('submitted_at'),
                'Expected submitted_at to be set.'
            );
        }
    }

    public function test_client_cannot_submit_other_clients_sample(): void
    {
        $clientA = $this->createClient('clientA_' . uniqid() . '@test.local');
        $clientB = $this->createClient('clientB_' . uniqid() . '@test.local');

        $clientBId = (int) ($clientB->client_id ?? $clientB->getKey());
        $sampleId = $this->createSampleForClient($clientBId, 'draft');

        Sanctum::actingAs($clientA, ['*']);

        $this->postJson("/api/v1/client/samples/{$sampleId}/submit", [])
            ->assertStatus(403);
    }

    public function test_staff_forbidden_on_client_endpoints(): void
    {
        // ini sekarang aman: staff baru tidak bakal bentrok staff_id=1 karena sequence sudah disync
        $staff = $this->createStaff('ADMIN', 'admin_' . uniqid() . '@test.local');
        Sanctum::actingAs($staff, ['*']);

        $this->postJson('/api/v1/client/samples', [
            'notes' => 'should be forbidden',
        ])->assertStatus(403);

        $this->getJson('/api/v1/client/samples')
            ->assertStatus(403);
    }
}
