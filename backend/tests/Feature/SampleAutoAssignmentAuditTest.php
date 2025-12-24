<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Carbon\Carbon;
use App\Models\Staff;
use Laravel\Sanctum\Sanctum;

class SampleAutoAssignmentAuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_sample_sets_created_by_and_assigned_to_and_writes_audit(): void
    {
        $this->seedRolesIfMissing();

        $admin = $this->makeStaff('Administrator', 'admin_autoassign@lims.local');
        $this->actingAsStaff($admin);

        // create client dulu (butuh client_id untuk create sample)
        [$clientResp, $clientId] = $this->apiCreateClient();
        $clientResp->assertStatus(201);
        $this->assertTrue($clientId > 0, 'client_id missing after create');

        // create sample (tanpa override assigned_to)
        $payload = [
            'client_id' => $clientId,
            'received_at' => Carbon::now()->format('Y-m-d\TH:i'),
            'sample_type' => 'nasopharyngeal swab',
            'priority' => 1,
            'contact_history' => 'tidak',
            'examination_purpose' => 'diagnostic',
            'additional_notes' => 'phpunit auto-assign + audit',
        ];

        $create = $this->postJson('/api/v1/samples', $payload);
        $create->assertStatus(201);

        $json = $create->json();
        $data = $json['data'] ?? $json;

        $sampleId = (int)($data['sample_id'] ?? 0);
        $this->assertTrue($sampleId > 0, 'sample_id missing in response');

        // 1) Assert created_by & assigned_to from response (kalau ada)
        $createdBy = (int)($data['created_by'] ?? 0);
        $assignedTo = (int)($data['assigned_to'] ?? 0);

        // fallback: ambil dari DB kalau response tidak include
        if ($createdBy <= 0 || $assignedTo <= 0) {
            $row = DB::table('samples')->where('sample_id', $sampleId)->first();
            $this->assertNotNull($row, 'sample not found in DB after create');
            $createdBy = (int)($row->created_by ?? 0);
            $assignedTo = (int)($row->assigned_to ?? 0);
        }

        $this->assertSame((int)$admin->staff_id, $createdBy, 'created_by must equal actor staff_id');
        $this->assertSame((int)$admin->staff_id, $assignedTo, 'assigned_to must default to created_by when no override');

        // 2) Assert audit log exists for sample create (SAMPLE_REGISTERED)
        $this->assertTrue(Schema::hasTable('audit_logs'), 'audit_logs table missing');

        $audit = DB::table('audit_logs')
            ->where('entity_name', 'samples')
            ->where('entity_id', $sampleId)
            ->where('action', 'SAMPLE_REGISTERED')
            ->orderByDesc('log_id')
            ->first();

        $this->assertNotNull($audit, 'audit log SAMPLE_REGISTERED not found for created sample');

        // 3) Validate minimal fields on audit row
        $this->assertSame((int)$admin->staff_id, (int)($audit->staff_id ?? 0), 'audit staff_id must equal actor staff_id');

        // 4) Validate new_values contains created_by & assigned_to
        $newValues = $audit->new_values ?? null;

        // Postgres JSON bisa kebaca sebagai string; normalize jadi array
        if (is_string($newValues)) {
            $decoded = json_decode($newValues, true);
            $newValues = $decoded ?? $newValues;
        }

        // Ada project yang simpan bentuk: {"client_id":..,"data":{...}}
        // jadi kita cari di root maupun di "data"
        $createdByInAudit = $this->extractInt($newValues, ['created_by', 'data.created_by']);
        $assignedToInAudit = $this->extractInt($newValues, ['assigned_to', 'data.assigned_to']);

        $this->assertSame($createdBy, $createdByInAudit, 'audit new_values must contain created_by');
        $this->assertSame($assignedTo, $assignedToInAudit, 'audit new_values must contain assigned_to');
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private function actingAsStaff(Staff $staff): void
    {
        if (class_exists(Sanctum::class)) {
            Sanctum::actingAs($staff, ['*'], 'api');
            return;
        }
        $this->actingAs($staff, 'api');
    }

    private function seedRolesIfMissing(): void
    {
        if (!Schema::hasTable('roles')) return;

        $defaults = [
            ['role_id' => 2, 'name' => 'Administrator', 'description' => 'System admin'],
            ['role_id' => 3, 'name' => 'Lab Head', 'description' => 'Lab head'],
            ['role_id' => 4, 'name' => 'Operational Manager', 'description' => 'Operational manager'],
            ['role_id' => 5, 'name' => 'Analyst', 'description' => 'Analyst'],
            ['role_id' => 6, 'name' => 'Sample Collector', 'description' => 'Sample collector'],
            ['role_id' => 7, 'name' => 'Operator', 'description' => 'Operator'],
        ];

        foreach ($defaults as $r) {
            $exists = DB::table('roles')->where('role_id', $r['role_id'])->exists();
            if (!$exists) {
                DB::table('roles')->insert(array_merge($r, [
                    'created_at' => now(),
                    'updated_at' => now(),
                ]));
            }
        }
    }

    private function getRoleId(string $name, int $fallback): int
    {
        if (!Schema::hasTable('roles')) return $fallback;

        $row = DB::table('roles')
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->first();

        if ($row && isset($row->role_id)) return (int)$row->role_id;

        $exists = DB::table('roles')->where('role_id', $fallback)->exists();
        if (!$exists) {
            DB::table('roles')->insert([
                'role_id' => $fallback,
                'name' => $name,
                'description' => $name,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        return $fallback;
    }

    private function makeStaff(string $roleName, string $email): Staff
    {
        if (!Schema::hasTable('staffs')) {
            $this->fail('Table "staffs" not found. Run migrations.');
        }

        $fallback = match (strtolower($roleName)) {
            'administrator' => 2,
            'lab head' => 3,
            'operational manager' => 4,
            'analyst' => 5,
            'sample collector' => 6,
            'operator' => 7,
            default => 2,
        };

        $staff = new Staff();
        $staff->name = $roleName . ' ' . Str::random(5);
        $staff->email = $email;
        $staff->password_hash = bcrypt('secret123');
        $staff->role_id = $this->getRoleId($roleName, $fallback);
        $staff->is_active = true;
        $staff->save();

        return $staff->fresh();
    }

    /**
     * @return array{0:\Illuminate\Testing\TestResponse,1:int} [resp, clientId]
     */
    private function apiCreateClient(): array
    {
        $payload = [
            'type' => 'individual',
            'name' => 'Client ' . Str::random(6),
            'email' => Str::random(8) . '@example.com',
            'phone' => '0812' . random_int(10000000, 99999999),
            'national_id' => (string) random_int(1000000000000000, 9999999999999999),
            'date_of_birth' => '1998-06-12',
            'gender' => 'male',
            'address_ktp' => 'Cemetery Lane',
            'address_domicile' => 'Cemetery Lane',
            'institution_name' => null,
            'institution_address' => null,
            'contact_person_name' => null,
            'contact_person_phone' => null,
            'contact_person_email' => null,
        ];

        $resp = $this->postJson('/api/v1/clients', $payload);

        if ($resp->status() === 422) {
            $this->fail("Client create got 422. Payload mismatch.\nBody:\n" . $resp->getContent());
        }

        $json = $resp->json();
        $data = $json['data'] ?? $json;
        $clientId = (int)($data['client_id'] ?? 0);

        if ($clientId <= 0 && Schema::hasTable('clients')) {
            $row = DB::table('clients')->orderByDesc('client_id')->first();
            $clientId = (int)($row->client_id ?? 0);
        }

        return [$resp, $clientId];
    }

    private function extractInt($maybeArray, array $paths): int
    {
        foreach ($paths as $p) {
            $v = $this->getByDotPath($maybeArray, $p);
            if (is_numeric($v)) return (int)$v;
        }
        return 0;
    }

    private function getByDotPath($data, string $path)
    {
        if (!is_array($data)) return null;

        $cur = $data;
        foreach (explode('.', $path) as $k) {
            if (!is_array($cur) || !array_key_exists($k, $cur)) return null;
            $cur = $cur[$k];
        }
        return $cur;
    }
}
