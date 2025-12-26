<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Support\AuditLogger;
use Laravel\Sanctum\TransientToken;

class ClientAuthController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', 'in:individual,institution'],
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'email', 'max:150'],
            'password' => ['required', 'string', 'min:8'],
            'password_confirmation' => ['required', 'same:password'],

            'national_id' => ['nullable', 'string', 'max:50'],
            'date_of_birth' => ['nullable', 'date'],
            'gender' => ['nullable', 'string', 'max:10'],
            'address_ktp' => ['nullable', 'string', 'max:255'],
            'address_domicile' => ['nullable', 'string', 'max:255'],

            'institution_name' => ['nullable', 'string', 'max:200'],
            'institution_address' => ['nullable', 'string', 'max:255'],
            'contact_person_name' => ['nullable', 'string', 'max:150'],
            'contact_person_phone' => ['nullable', 'string', 'max:30'],
            'contact_person_email' => ['nullable', 'email', 'max:150'],
        ]);

        if ($data['type'] === 'institution' && empty($data['institution_name'])) {
            return response()->json(['message' => 'institution_name is required when type=institution'], 422);
        }

        $client = Client::create([
            ...collect($data)->except(['password', 'password_confirmation'])->all(),
            'staff_id' => null,
            'password_hash' => Hash::make($data['password']),
            'is_active' => false,
        ]);

        AuditLogger::write('CLIENT_REGISTER_SUBMITTED', null, 'clients', $client->getKey(), null, [
            'email' => $client->email,
            'type'  => $client->type,
        ]);

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

    public function login(Request $request)
    {
        $data = $request->validate([
            'email'       => ['required', 'email'],
            'password'    => ['required', 'string'],
            'device_name' => ['nullable', 'string'], // ✅ token optional
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

        // ✅ session login (optional)
        if ($request->hasSession()) {
            Auth::guard('client')->login($client);
            $request->session()->regenerate();
        }

        // ✅ token login (recommended)
        $token = null;
        if (!empty($data['device_name'])) {
            $client->tokens()->delete(); // kebijakan: 1 client 1 token aktif
            $token = $client->createToken($data['device_name'])->plainTextToken;
        }

        AuditLogger::write('CLIENT_LOGIN_SUCCESS', null, 'clients', $client->getKey(), null, [
            'email' => $client->email,
            'via' => $token ? 'api_token' : 'browser_session',
            'device_name' => $data['device_name'] ?? null,
        ]);

        return response()->json([
            'client' => [
                'id' => $client->client_id,
                'name' => $client->name,
                'email' => $client->email,
            ],
            'token' => $token, // ✅ bisa null kalau login session
        ], 200);
    }

    public function me(Request $request)
    {
        // ✅ try token guard first, then session guard
        $client =
            $request->user('client_api')
            ?? Auth::guard('client')->user();

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

    public function logout(Request $request)
    {
        $client =
            $request->user('client_api')
            ?? Auth::guard('client')->user();

        $tokenId = null;

        // revoke token kalau via token
        if ($client && method_exists($client, 'currentAccessToken')) {
            $token = $client->currentAccessToken();
            if ($token && !$token instanceof TransientToken) {
                $tokenId = $token->id;
                $token->delete();
            }
        }

        AuditLogger::write('CLIENT_LOGOUT', null, 'clients', $client?->client_id, null, [
            'email' => $client?->email,
            'token_id' => $tokenId,
            'via' => $tokenId ? 'api_token' : 'browser_session',
        ]);

        Auth::guard('client')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }
}
