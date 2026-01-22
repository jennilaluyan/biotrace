<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Support\AuditLogger;

class ClientAuthController extends Controller
{
    // POST /api/v1/clients/register
    public function register(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', 'in:individual,institution'],
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'email', 'max:150'],

            'password' => ['required', 'string', 'min:8'],
            'password_confirmation' => ['required', 'same:password'],

            // optional: individual fields
            'national_id' => ['nullable', 'string', 'max:50'],
            'date_of_birth' => ['nullable', 'date'],
            'gender' => ['nullable', 'string', 'max:10'],
            'address_ktp' => ['nullable', 'string', 'max:255'],
            'address_domicile' => ['nullable', 'string', 'max:255'],

            // optional: institution fields
            'institution_name' => ['nullable', 'string', 'max:200'],
            'institution_address' => ['nullable', 'string', 'max:255'],
            'contact_person_name' => ['nullable', 'string', 'max:150'],
            'contact_person_phone' => ['nullable', 'string', 'max:30'],
            'contact_person_email' => ['nullable', 'email', 'max:150'],
        ]);

        if ($data['type'] === 'institution' && empty($data['institution_name'])) {
            return response()->json([
                'message' => 'institution_name is required when type=institution'
            ], 422);
        }

        $client = Client::create([
            ...collect($data)->except(['password', 'password_confirmation'])->all(),
            'staff_id' => null,
            'password_hash' => Hash::make($data['password']),
            'is_active' => false,
        ]);

        AuditLogger::write(
            'CLIENT_REGISTER_SUBMITTED',
            null,
            'clients',
            $client->getKey(),
            null,
            ['email' => $client->email, 'type' => $client->type]
        );

        return response()->json([
            'message' => 'Client registration submitted. Waiting for admin verification.',
            'client' => [
                'id' => $client->client_id,
                'name' => $client->name,
                'email' => $client->email,
                'is_active' => $client->is_active,
            ],
        ], 201);
    }

    // POST /api/v1/clients/login
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string'],
        ]);

        $client = Client::where('email', $data['email'])->first();

        if (!$client || !Hash::check($data['password'], $client->getAuthPassword())) {
            AuditLogger::write('CLIENT_LOGIN_FAILURE', null, 'clients', null, null, [
                'email' => $data['email'],
                'reason' => 'INVALID_CREDENTIALS',
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (!$client->is_active) {
            AuditLogger::write('CLIENT_LOGIN_FAILURE', null, 'clients', $client->getKey(), null, [
                'email' => $data['email'],
                'reason' => 'ACCOUNT_INACTIVE',
            ]);
            return response()->json(['message' => 'Account inactive'], 403);
        }

        // Optional: bersihkan token lama biar tidak numpuk
        $client->tokens()->delete();

        $device = $data['device_name'] ?? 'web';
        $token = $client->createToken($device)->plainTextToken;

        AuditLogger::write('CLIENT_LOGIN_SUCCESS', null, 'clients', $client->getKey(), null, [
            'email' => $client->email,
            'via' => 'sanctum_token',
        ]);

        return response()->json([
            'token' => $token,
            'client' => [
                'id' => $client->client_id,
                'name' => $client->name,
                'email' => $client->email,
            ],
        ], 200);
    }

    // GET /api/v1/clients/me  (protected by auth:client_api in routes)
    public function me(Request $request)
    {
        $client = $request->user('client_api');

        if (!$client) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        return response()->json([
            'client' => [
                'id' => $client->client_id,
                'name' => $client->name,
                'email' => $client->email,
            ],
        ], 200);
    }

    // POST /api/v1/clients/logout (protected by auth:client_api in routes)
    public function logout(Request $request)
    {
        $client = $request->user('client_api');

        AuditLogger::write('CLIENT_LOGOUT', null, 'clients', $client?->client_id, null, [
            'email' => $client?->email,
            'via' => 'sanctum_token',
        ]);

        if ($client) {
            $client->currentAccessToken()?->delete();
        }

        return response()->noContent();
    }
}
