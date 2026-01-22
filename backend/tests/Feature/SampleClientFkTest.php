<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SampleClientFkTest extends TestCase
{
    use RefreshDatabase;

    public function test_sample_client_fk_rejects_nonexistent_client_id(): void
    {
        if (!Schema::hasTable('samples') || !Schema::hasTable('clients')) {
            $this->markTestSkipped('samples/clients table not found');
        }

        $cols = array_flip(Schema::getColumnListing('samples'));

        // minimal insert yg paling sering lolos (sesuaikan kolom wajib kamu)
        $payload = [
            'client_id'      => 999999999, // gak ada
            'received_at'    => now(),
            'sample_type'    => 'routine',
            'priority'       => 0,
            'current_status' => 'received',
            'request_status' => 'draft',
            'created_at'     => now(),
            'updated_at'     => now(),
        ];

        $insert = array_intersect_key($payload, $cols);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('samples')->insert($insert);
    }
}
