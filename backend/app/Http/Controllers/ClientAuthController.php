<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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

        // enforce rules by type (biar data ga “campur”)
        if ($data['type'] === 'institution' && empty($data['institution_name'])) {
            return response()->json([
                'message' => 'institution_name is required when type=institution'
            ], 422);
        }

        $client = Client::create([
            ...collect($data)->except(['password', 'password_confirmation'])->all(),
            'staff_id' => null, // belum ada PIC
            'password_hash' => Hash::make($data['password']),
            'is_active' => false, // nunggu admin verify
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

        // session login
        if ($request->hasSession()) {
            Auth::guard('client')->login($client);
            $request->session()->regenerate();
        }

        AuditLogger::write('CLIENT_LOGIN_SUCCESS', null, 'clients', $client->getKey(), null, [
            'email' => $client->email,
            'via' => 'browser_session',
        ]);

        return response()->json([
            'client' => [
                'id' => $client->client_id,
                'name' => $client->name,
                'email' => $client->email,
            ],
        ], 200);
    }

    // GET /api/v1/clients/me
    public function me(Request $request)
    {
        $client = Auth::guard('client')->user();

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

    // POST /api/v1/clients/logout
    public function logout(Request $request)
    {
        $client = Auth::guard('client')->user();

        AuditLogger::write('CLIENT_LOGOUT', null, 'clients', $client?->client_id, null, [
            'email' => $client?->email,
            'via' => 'browser_session',
        ]);

        Auth::guard('client')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }
}
