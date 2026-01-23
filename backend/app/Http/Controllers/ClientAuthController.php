<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Support\AuditLogger;
use Illuminate\Database\QueryException;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Schema;

class ClientAuthController extends Controller
{
    // POST /api/v1/clients/register
    public function register(Request $request)
    {
        // normalize email
        $email = $request->input('email');
        if (is_string($email)) {
            $email = trim($email);
            $request->merge(['email' => $email]);
        }

        // kalau kolom email_ci ada, isi
        if (Schema::hasColumn('clients', 'email_ci') && is_string($email) && $email !== '') {
            $request->merge(['email_ci' => mb_strtolower($email)]);
        }

        $rules = [
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
        ];

        // Unique validation: email_ci jika ada, fallback email jika tidak ada
        if (Schema::hasColumn('clients', 'email_ci')) {
            $rules['email_ci'] = [
                'required',
                'string',
                'max:150',
                Rule::unique('clients', 'email_ci')->whereNull('deleted_at'),
            ];
        } else {
            $rules['email'][] = Rule::unique('clients', 'email')->whereNull('deleted_at');
        }

        $data = $request->validate($rules, [
            'email.unique' => 'Email sudah terdaftar. Silakan gunakan email lain atau login.',
            'email_ci.unique' => 'Email sudah terdaftar. Silakan gunakan email lain atau login.',
        ]);

        if ($data['type'] === 'institution' && empty($data['institution_name'])) {
            return response()->json([
                'message' => 'institution_name is required when type=institution'
            ], 422);
        }

        try {
            $createPayload = [
                ...collect($data)->except(['password', 'password_confirmation'])->all(),
                'staff_id' => null,
                'password_hash' => Hash::make($data['password']),
                'is_active' => false,
            ];

            // SAFETY: kalau kolom email_ci tidak ada, jangan ikut diinsert
            if (!Schema::hasColumn('clients', 'email_ci')) {
                unset($createPayload['email_ci']);
            }

            $client = Client::create($createPayload);
        } catch (QueryException $e) {
            // PostgreSQL unique violation: 23505
            $sqlState = $e->errorInfo[0] ?? null;
            if ($sqlState === '23505') {
                return response()->json([
                    'message' => 'Validation error.',
                    'errors' => [
                        'email' => ['Email sudah terdaftar. Silakan gunakan email lain atau login.'],
                    ],
                ], 422);
            }
            throw $e;
        }

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

        $email = trim($data['email']);

        // login: pakai email_ci kalau ada, fallback ke email
        if (Schema::hasColumn('clients', 'email_ci')) {
            $client = Client::where('email_ci', mb_strtolower($email))->first();
        } else {
            $client = Client::where('email', $email)->first();
        }

        if (!$client || !Hash::check($data['password'], $client->getAuthPassword())) {
            AuditLogger::write('CLIENT_LOGIN_FAILURE', null, 'clients', null, null, [
                'email' => $data['email'],
                'reason' => 'INVALID_CREDENTIALS',
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (!$client->is_active) {
            AuditLogger::write('CLIENT_LOGIN_FAILURE', null, 'clients', $client->getKey(), null, [
                'email' => $client->email,
                'reason' => 'ACCOUNT_INACTIVE',
            ]);
            return response()->json(['message' => 'Account inactive'], 403);
        }

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
