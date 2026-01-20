<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LetterOfOrderWorkflowApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_generate_sign_send_client_sign_locks(): void
    {
        $this->seed();

        Storage::fake('local');
        config()->set('loa.storage_disk', 'local');
        config()->set('loa.storage_path', 'letters/loa');

        // staff ids
        $omId = (int) (DB::table('staffs')->where('role_id', 5)->min('staff_id') ?: DB::table('staffs')->min('staff_id'));
        $lhId = (int) (DB::table('staffs')->where('role_id', 6)->min('staff_id') ?: DB::table('staffs')->min('staff_id'));

        // client
        $clientId = DB::table('clients')->insertGetId([
            'type' => 'individual',
            'name' => 'Client LoA',
            'email' => 'loa-client@test.local',
            'phone' => '0800000000',
            'password_hash' => bcrypt('secret'),
            'is_active' => true,
            'created_at' => now(),
        ], 'client_id');

        // sample must exist + already have lab_sample_code (after intake validated in real flow)
        $statusCol = \Illuminate\Support\Facades\Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'priority' => 1,
            $statusCol => 'received',
            'request_status' => 'physically_received',
            'lab_sample_code' => 'BML-001',
            'created_by' => $lhId,
            'assigned_to' => $lhId,
        ], 'sample_id');

        // ===== generate by LH =====
        $lh = \App\Models\Staff::query()->where('staff_id', $lhId)->firstOrFail();
        $resp = $this->actingAs($lh, 'sanctum')->postJson("/api/v1/samples/{$sampleId}/loa");
        $resp->assertStatus(201);

        $loa = DB::table('letters_of_order')->where('sample_id', $sampleId)->first();
        $this->assertNotNull($loa);
        $this->assertEquals('draft', $loa->loa_status);
        $this->assertNotEmpty($loa->file_url);
        $this->assertTrue(Storage::disk('local')->exists($loa->file_url));

        // ===== OM signs OM =====
        $om = \App\Models\Staff::query()->where('staff_id', $omId)->firstOrFail();
        $resp = $this->actingAs($om, 'sanctum')->postJson("/api/v1/loa/{$loa->lo_id}/sign", [
            'role_code' => 'OM',
        ]);
        $resp->assertStatus(200);

        // still draft (need LH too)
        $loa2 = DB::table('letters_of_order')->where('lo_id', $loa->lo_id)->first();
        $this->assertEquals('draft', $loa2->loa_status);

        // ===== LH signs LH => signed_internal =====
        $resp = $this->actingAs($lh, 'sanctum')->postJson("/api/v1/loa/{$loa->lo_id}/sign", [
            'role_code' => 'LH',
        ]);
        $resp->assertStatus(200);

        $loa3 = DB::table('letters_of_order')->where('lo_id', $loa->lo_id)->first();
        $this->assertEquals('signed_internal', $loa3->loa_status);

        // ===== send to client (OM only) =====
        $resp = $this->actingAs($om, 'sanctum')->postJson("/api/v1/loa/{$loa->lo_id}/send");
        $resp->assertStatus(200);

        $loa4 = DB::table('letters_of_order')->where('lo_id', $loa->lo_id)->first();
        $this->assertEquals('sent_to_client', $loa4->loa_status);

        // ===== client signs => locked =====
        $client = \App\Models\Client::query()->where('client_id', $clientId)->firstOrFail();
        $resp = $this->actingAs($client, 'sanctum')->postJson("/api/v1/client/loa/{$loa->lo_id}/sign");
        $resp->assertStatus(200);

        $loa5 = DB::table('letters_of_order')->where('lo_id', $loa->lo_id)->first();
        $this->assertEquals('locked', $loa5->loa_status);
        $this->assertNotNull($loa5->locked_at);
    }

    public function test_forbidden_send_requires_om(): void
    {
        $this->seed();

        $lhId = (int) (DB::table('staffs')->where('role_id', 6)->min('staff_id') ?: DB::table('staffs')->min('staff_id'));
        $lh = \App\Models\Staff::query()->where('staff_id', $lhId)->firstOrFail();

        // create dummy loa row (minimal)
        $clientId = DB::table('clients')->insertGetId([
            'type' => 'individual',
            'name' => 'Client X',
            'email' => 'x@test.local',
            'phone' => '0800000000',
            'password_hash' => bcrypt('secret'),
            'is_active' => true,
            'created_at' => now(),
        ], 'client_id');

        $statusCol = \Illuminate\Support\Facades\Schema::hasColumn('samples', 'current_status') ? 'current_status' : 'status';

        $sampleId = DB::table('samples')->insertGetId([
            'client_id' => $clientId,
            'received_at' => now(),
            'sample_type' => 'swab',
            'examination_purpose' => 'testing',
            'priority' => 1,
            $statusCol => 'received',
            'request_status' => 'physically_received',
            'lab_sample_code' => 'BML-001',
            'created_by' => $lhId,
            'assigned_to' => $lhId,
        ], 'sample_id');

        DB::table('letters_of_order')->insert([
            'sample_id' => $sampleId,
            'number' => '001/LAB-BM/BA/2026',
            'generated_at' => now(),
            'file_url' => 'letters/loa/dummy.pdf',
            'loa_status' => 'signed_internal',
            'created_at' => now(),
        ]);

        $loaId = (int) DB::table('letters_of_order')->where('sample_id', $sampleId)->value('lo_id');

        $resp = $this->actingAs($lh, 'sanctum')->postJson("/api/v1/loa/{$loaId}/send");
        $resp->assertStatus(403);
    }
}
