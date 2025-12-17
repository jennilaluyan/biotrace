<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Role;
use App\Models\Staff;
use Illuminate\Foundation\Testing\RefreshDatabase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Helper: buat role kalau belum ada.
     */
    protected function createRole(string $name): Role
    {
        return Role::firstOrCreate(
            ['name' => $name],
            ['description' => 'Test role ' . $name]
        );
    }

    /**
     * Helper: buat staff dengan role tertentu.
     */
    protected function createStaff(string $roleName, bool $active = true): Staff
    {
        $role = $this->createRole($roleName);

        return Staff::create([
            'name'          => 'Test ' . $roleName,
            'email'         => 'test_' . strtolower(str_replace(' ', '_', $roleName)) . '@example.com',
            'password_hash' => bcrypt('secret123'),
            'role_id'       => $role->role_id,
            'is_active'     => $active,
        ]);
    }

    /**
     * Admin bisa login dengan kredensial benar (tanpa device_name → response JSON tanpa token).
     * Di environment test API ini kita fokus cek response, bukan state session guard web.
     */
    public function test_admin_can_login_with_valid_credentials_via_session()
    {
        $admin = $this->createStaff('Administrator');

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $admin->email,
            'password' => 'secret123',
            // device_name sengaja dikosongkan → mode "browser/session" di FE,
            // tapi di test ini request tetap lewat grup "api" yang cenderung stateless.
        ]);

        $response
            ->assertStatus(200)
            ->assertJsonPath('user.id', $admin->staff_id)
            ->assertJsonPath('user.email', $admin->email)
            ->assertJsonPath('user.role.name', 'Administrator')
            ->assertJsonPath('token', null); // untuk browser, token null

        // Catatan:
        // Di sini TIDAK memakai $this->assertAuthenticated()
        // karena request test ini lewat grup "api" (JSON) yang tidak selalu
        // menginisialisasi session guard "web".
    }

    /**
     * Admin bisa login via API token (dengan device_name).
     */
    public function test_admin_can_login_via_api_token()
    {
        $admin = $this->createStaff('Administrator');

        $response = $this->postJson('/api/v1/auth/login', [
            'email'       => $admin->email,
            'password'    => 'secret123',
            'device_name' => 'Postman',
        ]);

        $response
            ->assertStatus(200)
            ->assertJsonPath('user.id', $admin->staff_id)
            ->assertJsonMissingExact(['token' => null]); // token harus ada

        $token = $response->json('token');
        $this->assertIsString($token);
        $this->assertNotSame('', $token);

        // Pastikan token tersimpan di DB Sanctum
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id'   => $admin->staff_id,
            'tokenable_type' => Staff::class,
            'name'           => 'Postman',
        ]);
    }

    /**
     * Login gagal jika password salah.
     */
    public function test_login_fails_with_wrong_password()
    {
        $admin = $this->createStaff('Administrator');

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $admin->email,
            'password' => 'wrong-password',
        ]);

        $response
            ->assertStatus(401)
            ->assertJsonPath('message', 'Invalid credentials');

        $this->assertGuest(); // tidak ada user yang ter-auth
    }

    /**
     * User yang non-aktif tidak bisa login.
     */
    public function test_inactive_user_cannot_login()
    {
        $inactiveUser = $this->createStaff('Administrator', active: false);

        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => $inactiveUser->email,
            'password' => 'secret123',
        ]);

        $response
            ->assertStatus(403)
            ->assertJsonPath('message', 'Account inactive');

        $this->assertGuest();
    }

    /**
     * Endpoint /auth/me mengembalikan profil user yang sudah login (via token).
     */
    public function test_authenticated_user_can_get_profile_via_me_endpoint()
    {
        $admin = $this->createStaff('Administrator');

        // Login via token dulu
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email'       => $admin->email,
            'password'    => 'secret123',
            'device_name' => 'Postman',
        ])->assertStatus(200);

        $token = $loginResponse->json('token');

        // Panggil /auth/me dengan Bearer token
        $response = $this->getJson('/api/v1/auth/me', [
            'Authorization' => 'Bearer ' . $token,
        ]);

        $response
            ->assertStatus(200)
            ->assertJsonPath('user.id', $admin->staff_id)
            ->assertJsonPath('user.email', $admin->email)
            ->assertJsonPath('user.role.name', 'Administrator');
    }

    /**
     * /auth/me tanpa autentikasi harus 401, dengan payload error standar ApiResponse.
     */
    public function test_me_endpoint_requires_authentication()
    {
        $response = $this->getJson('/api/v1/auth/me');

        $response
            ->assertStatus(401)
            ->assertJsonPath('code', 'AUTH.UNAUTHENTICATED')
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    /**
     * Logout via API token harus mencabut token dan mengosongkan auth.
     */
    public function test_authenticated_user_can_logout_and_token_is_revoked()
    {
        $admin = $this->createStaff('Administrator');

        // Login via token
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email'       => $admin->email,
            'password'    => 'secret123',
            'device_name' => 'Postman',
        ])->assertStatus(200);

        $token = $loginResponse->json('token');

        // Pastikan token ada
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id'   => $admin->staff_id,
            'tokenable_type' => Staff::class,
            'name'           => 'Postman',
        ]);

        // Logout
        $response = $this->postJson('/api/v1/auth/logout', [], [
            'Authorization' => 'Bearer ' . $token,
        ]);

        $response->assertNoContent(); // HTTP 204

        // Token harus hilang dari DB
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id'   => $admin->staff_id,
            'tokenable_type' => Staff::class,
            'name'           => 'Postman',
        ]);
    }
}
