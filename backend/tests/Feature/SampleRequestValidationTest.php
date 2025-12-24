<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Role;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use App\Http\Requests\SampleStoreRequest;

class SampleRequestValidationTest extends TestCase
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
     * Helper: buat 1 Client dummy.
     */
    protected function createClient(?Staff $pic = null): Client
    {
        $pic ??= $this->createStaffWithRole('Administrator');

        return Client::create([
            'staff_id' => $pic->staff_id,
            'type'     => 'individual',
            'name'     => 'Test Client',
            'email'    => 'client_' . $pic->staff_id . '@example.com',
        ]);
    }

    /**
     * Helper: payload sample valid versi FormRequest.
     */
    protected function validSamplePayload(Client $client): array
    {
        return [
            'client_id'           => $client->client_id,
            'received_at'         => now()->toDateTimeString(),
            'sample_type'         => 'nasopharyngeal swab',
            'examination_purpose' => 'diagnostic',
            'contact_history'     => 'tidak',
            'priority'            => 1,
            'additional_notes'    => 'Sample for diagnostic testing',
        ];
    }

    /**
     * Helper: buat validator pakai SampleStoreRequest (tanpa hit controller/DB).
     */
    protected function makeValidator(array $data)
    {
        $formRequest = new SampleStoreRequest();

        return Validator::make(
            $data,
            $formRequest->rules(),
            $formRequest->messages()
        );
    }

    // ---------------------------------------------------------------------
    // 1) HAPPY PATH: integration test ke /api/v1/samples
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function admin_can_create_sample_with_valid_payload()
    {
        // Arrange: admin + client
        $admin = $this->createStaffWithRole('Administrator');
        $this->actingAs($admin);

        $client  = $this->createClient($admin);
        $payload = $this->validSamplePayload($client);

        // Act: call API
        $response = $this->postJson('/api/v1/samples', $payload);

        // Assert: response JSON & DB
        $response
            ->assertStatus(201)
            ->assertJsonPath('message', 'Sample registered successfully.')
            ->assertJsonPath('data.client_id', $client->client_id)
            ->assertJsonPath('data.current_status', 'received');

        $this->assertDatabaseHas('samples', [
            'client_id'      => $client->client_id,
            'current_status' => 'received',
            'created_by'     => $admin->staff_id,
        ]);
    }

    // ---------------------------------------------------------------------
    // 2) UNIT TEST: rules() SampleStoreRequest (tanpa HTTP/DB)
    // ---------------------------------------------------------------------

    #[\PHPUnit\Framework\Attributes\Test]
    public function client_id_is_required()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        unset($payload['client_id']);

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal tanpa client_id.');
        $this->assertArrayHasKey('client_id', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function client_id_must_exist_in_clients_table()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        $payload['client_id'] = 999999; // id yang tidak ada

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal jika client_id tidak ada di tabel clients.');
        $this->assertArrayHasKey('client_id', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function received_at_is_required()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        unset($payload['received_at']);

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal tanpa received_at.');
        $this->assertArrayHasKey('received_at', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function received_at_must_be_a_valid_date()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        $payload['received_at'] = 'not-a-date';

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal jika received_at bukan date.');
        $this->assertArrayHasKey('received_at', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function sample_type_is_required()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        unset($payload['sample_type']);

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal tanpa sample_type.');
        $this->assertArrayHasKey('sample_type', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function sample_type_must_not_exceed_max_length()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        $payload['sample_type'] = str_repeat('X', 81); // > max:80

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal jika sample_type melebihi 80 karakter.');
        $this->assertArrayHasKey('sample_type', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function contact_history_must_be_valid_value_when_present()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        $payload['contact_history'] = 'unknown'; // bukan ada/tidak/tidak_tahu

        $validator = $this->makeValidator($payload);

        $this->assertTrue(
            $validator->fails(),
            'Validator seharusnya gagal jika contact_history bukan salah satu dari: ada, tidak, tidak_tahu.'
        );
        $this->assertArrayHasKey('contact_history', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function priority_must_be_integer_if_present()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        $payload['priority'] = 'high';

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal jika priority bukan integer.');
        $this->assertArrayHasKey('priority', $validator->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function priority_must_be_within_defined_range_if_present()
    {
        $client  = $this->createClient();

        // < 0
        $payloadLow = $this->validSamplePayload($client);
        $payloadLow['priority'] = -1;

        $validatorLow = $this->makeValidator($payloadLow);
        $this->assertTrue($validatorLow->fails(), 'Validator seharusnya gagal jika priority < 0.');
        $this->assertArrayHasKey('priority', $validatorLow->errors()->toArray());

        // > 5
        $payloadHigh = $this->validSamplePayload($client);
        $payloadHigh['priority'] = 6;

        $validatorHigh = $this->makeValidator($payloadHigh);
        $this->assertTrue($validatorHigh->fails(), 'Validator seharusnya gagal jika priority > 5.');
        $this->assertArrayHasKey('priority', $validatorHigh->errors()->toArray());
    }

    #[\PHPUnit\Framework\Attributes\Test]
    public function additional_notes_must_be_string_if_present()
    {
        $client  = $this->createClient();
        $payload = $this->validSamplePayload($client);
        $payload['additional_notes'] = ['not', 'a', 'string'];

        $validator = $this->makeValidator($payload);

        $this->assertTrue($validator->fails(), 'Validator seharusnya gagal jika additional_notes bukan string.');
        $this->assertArrayHasKey('additional_notes', $validator->errors()->toArray());
    }
}
