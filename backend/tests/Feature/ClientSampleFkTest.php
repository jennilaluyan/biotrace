<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Role;
use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class ClientSampleFkTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper: buat Staff dengan role tertentu.
     */
    protected function createStaffWithRole(string $roleName): Staff
    {
        $role = Role::firstOrCreate(
            ['name' => $roleName],
            ['description' => 'Test role ' . $roleName]
        );

        return Staff::create([
            'name'          => 'Test ' . $roleName,
            'email'         => 'test_' . strtolower(str_replace(' ', '_', $roleName)) . '@example.com',
            'password_hash' => bcrypt('secret'),
            'role_id'       => $role->role_id,
            'is_active'     => true,
        ]);
    }

    /**
     * Helper: buat Client dummy.
     */
    protected function createClient(?Staff $pic = null): Client
    {
        $pic ??= $this->createStaffWithRole('Administrator');

        return Client::create([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'FK Test Client',
            'email'    => 'fk_client_' . $pic->staff_id . '@example.com',
        ]);
    }

    /**
     * Helper: buat Sample terkait client & staff.
     */
    protected function createSample(Client $client, Staff $creator): Sample
    {
        return Sample::create([
            'client_id'           => $client->client_id,
            'received_at'         => now(),
            'sample_type'         => 'serum',
            'examination_purpose' => 'screening',
            'contact_history'     => null,
            'priority'            => 0,
            'current_status'      => 'received',
            'additional_notes'    => 'FK test sample',
            'created_by'          => $creator->staff_id,
        ]);
    }

    // ---------------------------------------------------------------------
    // FK: samples.client_id → clients.client_id
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function cannot_insert_sample_with_non_existing_client_id(): void
    {
        $admin = $this->createStaffWithRole('Administrator');

        $this->expectException(QueryException::class);

        // client_id 999999 tidak ada di tabel clients
        Sample::create([
            'client_id'           => 999999,
            'received_at'         => now(),
            'sample_type'         => 'serum',
            'examination_purpose' => 'screening',
            'contact_history'     => null,
            'priority'            => 0,
            'current_status'      => 'received',
            'additional_notes'    => 'Invalid client FK',
            'created_by'          => $admin->staff_id,
        ]);
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function client_with_existing_samples_cannot_be_hard_deleted_due_to_fk_restriction(): void
    {
        $admin  = $this->createStaffWithRole('Administrator');
        $client = $this->createClient($admin);

        $this->createSample($client, $admin);

        // Soft delete via Eloquent (if enabled) tidak akan melanggar FK,
        // karena baris masih ada. Yang ingin kita uji di sini adalah
        // HARD DELETE (physically remove row) akan gagal karena restrictOnDelete.
        $this->expectException(QueryException::class);

        DB::table('clients')
            ->where('client_id', $client->client_id)
            ->delete();
    }
}
