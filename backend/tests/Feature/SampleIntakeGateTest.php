<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use App\Models\Staff;
use App\Models\Sample;

class SampleIntakeGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_lab_workflow_blocked_until_physically_received(): void
    {
        // pakai helper create staff/admin yang sudah kamu punya di test lain kalau ada
        $admin = Staff::factory()->create(); // kalau kamu tidak pakai factory, ganti dengan helper DB insert seperti test lain
        Sanctum::actingAs($admin, ['*']);

        $sample = Sample::query()->create([
            'client_id' => 1, // sesuaikan: pakai helper create client kalau perlu
            'sample_type' => 'routine',
            'current_status' => 'received',
            'received_at' => now(),
            'priority' => 0,
            'created_by' => $admin->staff_id,
            'request_status' => 'submitted',
            'submitted_at' => now(),
        ]);

        // 1) coba masuk lab workflow => harus 422
        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'status' => 'in_progress',
            'note' => 'start lab',
        ])->assertStatus(422);

        // 2) set request_status sampai physically_received
        $this->postJson("/api/v1/samples/{$sample->sample_id}/request-status", [
            'request_status' => 'ready_for_delivery',
        ])->assertStatus(200);

        $this->postJson("/api/v1/samples/{$sample->sample_id}/request-status", [
            'request_status' => 'physically_received',
        ])->assertStatus(200);

        $sample->refresh();
        $this->assertSame('physically_received', $sample->request_status);
        $this->assertNotNull($sample->physically_received_at);
        // optional kalau kolom ada:
        // $this->assertNotEmpty($sample->lab_sample_code);

        // 3) sekarang boleh masuk lab workflow
        $this->postJson("/api/v1/samples/{$sample->sample_id}/status", [
            'status' => 'in_progress',
            'note' => 'start lab',
        ])->assertStatus(200);
    }
}
