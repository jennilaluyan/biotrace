<?php
// backend/tests/Feature/QcFlowFeatureTest.php

namespace Tests\Feature;

use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QcFlowFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_submit_qc_runs_then_qc_summary_is_updated(): void
    {
        $analyst = $this->actingAsAnalyst();

        $clientId = $this->createClient(createdBy: (int) $analyst->staff_id);
        $sampleId = $this->createSample(clientId: $clientId, createdBy: (int) $analyst->staff_id);

        $parameterId = $this->createParameter(createdBy: (int) $analyst->staff_id);

        $qcControlId = $this->createQcControl(
            parameterId: $parameterId,
            ruleset: ['1-2s', '1-3s'],
            target: 0.0,
            tolerance: 1.0
        );

        // z = 2.1 -> warning (1-2s)
        $this->createQcRun(sampleId: $sampleId, qcControlId: $qcControlId, value: 2.1);

        $resp = $this->getJson("/api/v1/samples/{$sampleId}/qc-summary");
        $resp->assertOk();

        [$status, $counts] = $this->extractQcSummary($resp->json());

        $this->assertSame('warning', $status, 'QC summary status should be warning');
        $this->assertSame(1, (int) ($counts['warning'] ?? 0), 'QC summary warning count should be 1');
    }

    public function test_status_transition_is_blocked_when_qc_fail(): void
    {
        $analyst = $this->actingAsAnalyst();

        $clientId = $this->createClient(createdBy: (int) $analyst->staff_id);
        $sampleId = $this->createSample(clientId: $clientId, createdBy: (int) $analyst->staff_id);

        $parameterId = $this->createParameter(createdBy: (int) $analyst->staff_id);

        $qcControlId = $this->createQcControl(
            parameterId: $parameterId,
            ruleset: ['1-2s', '1-3s'],
            target: 0.0,
            tolerance: 1.0
        );

        $sampleTestId = $this->createSampleTest(
            sampleId: $sampleId,
            parameterId: $parameterId,
            createdBy: (int) $analyst->staff_id
        );

        // z = 4.0 -> fail (1-3s)
        $this->createQcRun(sampleId: $sampleId, qcControlId: $qcControlId, value: 4.0);

        $sum = $this->getJson("/api/v1/samples/{$sampleId}/qc-summary");
        $sum->assertOk();

        [$status] = $this->extractQcSummary($sum->json());
        $this->assertSame('fail', $status, 'QC summary status should be fail');

        $resp = $this->postJson("/api/v1/sample-tests/{$sampleTestId}/status", [
            'status' => 'in_progress',
        ]);

        $this->assertTrue(
            in_array($resp->getStatusCode(), [400, 403, 409, 422], true),
            "Expected blocked transition (400/403/409/422), got {$resp->getStatusCode()}"
        );

        $fresh = DB::table('sample_tests')->where('sample_test_id', $sampleTestId)->first();
        $this->assertNotNull($fresh);
        $this->assertSame('draft', $fresh->status, 'Status should remain draft when QC is FAIL');
    }

    /**
     * ✅ Robust extractor (karena response shape bisa beda-beda)
     * Return: [status(string|null), counts(array)]
     */
    private function extractQcSummary(array $json): array
    {
        // kandidat path status/state yang sering dipakai
        $status =
            data_get($json, 'data.status')
            ?? data_get($json, 'data.state')
            ?? data_get($json, 'data.summary.status')
            ?? data_get($json, 'data.summary.state')
            ?? data_get($json, 'data.overall_status')
            ?? data_get($json, 'data.overall_state')
            ?? data_get($json, 'status')
            ?? data_get($json, 'state');

        // kandidat path counts
        $counts =
            data_get($json, 'data.counts')
            ?? data_get($json, 'data.summary.counts')
            ?? data_get($json, 'data.breakdown')
            ?? data_get($json, 'counts')
            ?? [];

        if (!is_array($counts)) {
            $counts = [];
        }

        return [$status, $counts];
    }

    /* ------------------------------ Auth / Roles ------------------------------ */

    private function actingAsAnalyst(): Staff
    {
        $this->ensureRoleExists(4, 'Analyst');

        $staff = Staff::factory()->create([
            'role_id' => 4,
            'is_active' => true,
        ]);

        Sanctum::actingAs($staff);

        return $staff;
    }

    private function ensureRoleExists(int $roleId, string $name): void
    {
        if (!Schema::hasTable('roles')) {
            return;
        }

        $exists = DB::table('roles')->where('role_id', $roleId)->exists();
        if ($exists) {
            return;
        }

        $cols = Schema::getColumnListing('roles');
        $row = [];

        if (in_array('role_id', $cols, true)) {
            $row['role_id'] = $roleId;
        }
        if (in_array('name', $cols, true)) {
            $row['name'] = $name;
        }
        if (in_array('created_at', $cols, true)) {
            $row['created_at'] = now();
        }
        if (in_array('updated_at', $cols, true)) {
            $row['updated_at'] = now();
        }

        DB::table('roles')->insert($row);
    }

    /* ------------------------------ Domain setup ------------------------------ */

    private function createClient(int $createdBy): int
    {
        $meta = $this->tableMeta('clients');
        $cols = array_keys($meta);

        $row = [];

        if (isset($meta['name'])) $row['name'] = 'QC Client ' . Str::random(6);
        if (isset($meta['email'])) $row['email'] = Str::random(8) . '@example.com';
        if (isset($meta['phone'])) $row['phone'] = '0812' . random_int(1000000, 9999999);
        if (isset($meta['address'])) $row['address'] = 'Test Address';

        foreach (['created_by', 'updated_by'] as $c) {
            if (isset($meta[$c])) $row[$c] = $createdBy;
        }

        foreach (['is_active', 'is_verified'] as $c) {
            if (isset($meta[$c])) $row[$c] = true;
        }

        if (isset($meta['type']) && !array_key_exists('type', $row)) {
            $allowed = $this->allowedValuesFromCheckConstraint('clients', 'chk_clients_type');
            $row['type'] = $allowed[0] ?? $this->fallbackClientType();
        }

        foreach (['created_at', 'updated_at'] as $c) {
            if (isset($meta[$c])) $row[$c] = now();
        }

        foreach ($meta as $name => $info) {
            if ($name === 'client_id') continue;
            if (array_key_exists($name, $row)) continue;

            $isRequired = ($info['is_nullable'] === 'NO') && ($info['column_default'] === null);
            if (!$isRequired) continue;

            $row[$name] = $this->defaultValueForColumn('clients', $name, $info['data_type']);
        }

        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('clients')->insertGetId($row, 'client_id');
    }

    private function fallbackClientType(): string
    {
        // fallback umum (kalau constraint tidak kebaca)
        return 'Individual';
    }

    private function createSample(int $clientId, int $createdBy): int
    {
        $meta = $this->tableMeta('samples');
        $cols = array_keys($meta);

        $row = [];

        if (isset($meta['client_id'])) $row['client_id'] = $clientId;
        if (isset($meta['received_at'])) $row['received_at'] = now();
        if (isset($meta['sample_type'])) $row['sample_type'] = 'blood';
        if (isset($meta['priority'])) $row['priority'] = 1;
        if (isset($meta['additional_notes'])) $row['additional_notes'] = 'QC test sample';

        if (isset($meta['contact_history'])) {
            $allowed = $this->allowedValuesFromCheckConstraint('samples', 'chk_samples_contact_history');
            if (!empty($allowed)) {
                $row['contact_history'] = $allowed[0];
            } elseif (($meta['contact_history']['is_nullable'] ?? 'YES') === 'NO') {
                $row['contact_history'] = 'No';
            }
        }

        $allowedStatus = $this->allowedValuesFromCheckConstraint('samples', 'chk_samples_status');
        $statusValue = $allowedStatus[0] ?? 'registered';

        foreach (['status', 'current_status'] as $c) {
            if (isset($meta[$c])) $row[$c] = $statusValue;
        }

        foreach (['created_by', 'updated_by', 'assigned_to'] as $c) {
            if (isset($meta[$c])) $row[$c] = $createdBy;
        }

        foreach (['created_at', 'updated_at'] as $c) {
            if (isset($meta[$c])) $row[$c] = now();
        }

        foreach ($meta as $name => $info) {
            if ($name === 'sample_id') continue;
            if (array_key_exists($name, $row)) continue;

            $isRequired = ($info['is_nullable'] === 'NO') && ($info['column_default'] === null);
            if (!$isRequired) continue;

            $row[$name] = $this->defaultValueForColumn('samples', $name, $info['data_type']);
        }

        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('samples')->insertGetId($row, 'sample_id');
    }

    private function createParameter(int $createdBy): int
    {
        $cols = Schema::getColumnListing('parameters');

        $row = [
            'code' => 'QC-P-' . Str::upper(Str::random(6)),
            'name' => 'QC Parameter ' . Str::random(6),
            'unit' => 'mg/dL',
            'method_ref' => 'WHO',
            'created_by' => $createdBy,
            'status' => 'Active',
            'tag' => 'Routine',
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (in_array('unit_id', $cols, true)) {
            $row['unit_id'] = null;
        }

        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('parameters')->insertGetId($row, 'parameter_id');
    }

    private function createQcControl(int $parameterId, array $ruleset, float $target, float $tolerance): int
    {
        $cols = Schema::getColumnListing('qc_controls');

        $row = [
            'parameter_id' => $parameterId,
            'control_type' => 'control_material',
            'target' => $target,
            'tolerance' => $tolerance,
            // jsonb safe
            'ruleset' => json_encode(array_values($ruleset)),
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (in_array('method_id', $cols, true)) $row['method_id'] = null;
        if (in_array('note', $cols, true)) $row['note'] = null;

        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('qc_controls')->insertGetId($row, 'qc_control_id');
    }

    private function createQcRun(int $sampleId, int $qcControlId, float $value): void
    {
        $resp = $this->postJson("/api/v1/samples/{$sampleId}/qc-runs", [
            'qc_control_id' => $qcControlId,
            'value' => $value,
        ]);

        $this->assertTrue(
            in_array($resp->getStatusCode(), [200, 201], true),
            "Expected 200/201 from qc-runs create, got {$resp->getStatusCode()}"
        );
    }

    private function createSampleTest(int $sampleId, int $parameterId, int $createdBy): int
    {
        $meta = $this->tableMeta('sample_tests');
        $cols = array_keys($meta);

        $row = [];

        if (isset($meta['sample_id'])) $row['sample_id'] = $sampleId;
        if (isset($meta['parameter_id'])) $row['parameter_id'] = $parameterId;
        if (isset($meta['status'])) $row['status'] = 'draft';

        foreach (['created_by', 'updated_by'] as $c) {
            if (isset($meta[$c])) $row[$c] = $createdBy;
        }

        foreach (['created_at', 'updated_at'] as $c) {
            if (isset($meta[$c])) $row[$c] = now();
        }

        foreach ($meta as $name => $info) {
            if ($name === 'sample_test_id') continue;
            if (array_key_exists($name, $row)) continue;

            $isRequired = ($info['is_nullable'] === 'NO') && ($info['column_default'] === null);
            if (!$isRequired) continue;

            $row[$name] = $this->defaultValueForColumn('sample_tests', $name, $info['data_type']);
        }

        $row = array_intersect_key($row, array_flip($cols));

        return (int) DB::table('sample_tests')->insertGetId($row, 'sample_test_id');
    }

    /* ------------------------------ Constraint helpers ------------------------------ */

    private function allowedValuesFromCheckConstraint(string $table, string $constraintName): array
    {
        $rows = DB::select(
            "select pg_get_constraintdef(c.oid) as def
             from pg_constraint c
             join pg_class t on t.oid = c.conrelid
             where t.relname = ? and c.conname = ?
             limit 1",
            [$table, $constraintName]
        );

        if (empty($rows) || empty($rows[0]->def)) {
            return [];
        }

        $def = (string) $rows[0]->def;

        if (!preg_match_all("/'((?:''|[^'])*)'/", $def, $m)) {
            return [];
        }

        $vals = [];
        foreach ($m[1] as $raw) {
            $vals[] = str_replace("''", "'", $raw);
        }

        return array_values(array_unique(array_filter($vals, fn($v) => $v !== '')));
    }

    private function tableMeta(string $table): array
    {
        $rows = DB::select(
            "select column_name, is_nullable, column_default, data_type
             from information_schema.columns
             where table_schema = 'public' and table_name = ?",
            [$table]
        );

        $out = [];
        foreach ($rows as $r) {
            $out[$r->column_name] = [
                'is_nullable' => $r->is_nullable,
                'column_default' => $r->column_default,
                'data_type' => $r->data_type,
            ];
        }

        return $out;
    }

    private function defaultValueForColumn(string $table, string $name, string $dataType)
    {
        $lname = strtolower($name);
        $dt = strtolower($dataType);

        if ($lname === 'email') return Str::random(8) . '@example.com';
        if ($lname === 'password_hash') return bcrypt('password');
        if ($lname === 'method_ref') return 'WHO';
        if ($lname === 'unit') return 'mg/dL';
        if ($lname === 'tag') return 'Routine';

        if ($table === 'clients' && $lname === 'type') {
            $allowed = $this->allowedValuesFromCheckConstraint('clients', 'chk_clients_type');
            return $allowed[0] ?? $this->fallbackClientType();
        }

        if ($table === 'samples' && ($lname === 'status' || $lname === 'current_status')) {
            $allowed = $this->allowedValuesFromCheckConstraint('samples', 'chk_samples_status');
            return $allowed[0] ?? 'registered';
        }

        if ($table === 'samples' && $lname === 'contact_history') {
            $allowed = $this->allowedValuesFromCheckConstraint('samples', 'chk_samples_contact_history');
            return $allowed[0] ?? null;
        }

        if (str_ends_with($lname, '_id')) return 1;
        if ($dt === 'boolean') return true;
        if (in_array($dt, ['integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real'], true)) return 0;
        if (str_contains($dt, 'timestamp')) return now();
        if (str_contains($dt, 'json')) return json_encode([]);

        return 'test';
    }
}
