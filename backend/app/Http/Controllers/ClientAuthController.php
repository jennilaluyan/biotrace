<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\ClientApplication;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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

        // normalize email_ci on payload (we always store it in applications table)
        if (is_string($email) && $email !== '') {
            $request->merge(['email_ci' => mb_strtolower($email)]);
        }

        $rules = [
            'type' => ['required', 'in:individual,institution'],
            'name' => ['required', 'string', 'max:150'],

            // A3: required +62 + min 10 digits
            'phone' => ['required', 'string', 'max:30', 'regex:/^\+62\d{10,13}$/'],

            'email' => ['required', 'email', 'max:150'],
            'email_ci' => ['required', 'string', 'max:150'],

            'password' => ['required', 'string', 'min:8'],
            'password_confirmation' => ['required', 'same:password'],

            // A2: required if individual, exactly 16 digits
            'national_id' => ['required_if:type,individual', 'digits:16'],

            'date_of_birth' => ['nullable', 'date'],
            'gender' => ['nullable', 'string', 'max:10'],
            'address_ktp' => ['nullable', 'string', 'max:255'],
            'address_domicile' => ['nullable', 'string', 'max:255'],

            'institution_name' => ['nullable', 'string', 'max:200'],
            'institution_address' => ['nullable', 'string', 'max:255'],
            'contact_person_name' => ['nullable', 'string', 'max:150'],
            'contact_person_phone' => ['nullable', 'string', 'max:30', 'regex:/^\+62\d{10,13}$/'],
            'contact_person_email' => ['nullable', 'email', 'max:150'],
        ];

        $messages = [
            'type.required' => 'Client type is required.',
            'type.in' => 'Client type must be individual or institution.',
            'name.required' => 'Name is required.',
            'phone.required' => 'Phone is required.',
            'phone.regex' => 'Phone number is incomplete. Please enter at least 10 digits after +62.',
            'email.required' => 'Email is required.',
            'email.email' => 'Email format is invalid.',
            'password.required' => 'Password is required.',
            'password.min' => 'Password must be at least 8 characters.',
            'password_confirmation.required' => 'Confirm password is required.',
            'password_confirmation.same' => 'Password confirmation does not match.',
            'national_id.required_if' => 'National ID (NIK) is required for individual clients.',
            'national_id.digits' => 'National ID (NIK) must be exactly 16 digits.',
            'contact_person_phone.regex' => 'Contact person phone is incomplete. Please enter at least 10 digits after +62.',
            'contact_person_email.email' => 'Contact person email format is invalid.',
        ];

        $data = $request->validate($rules, $messages);

        if ($data['type'] === 'institution' && empty($data['institution_name'])) {
            return response()->json([
                'message' => 'Validation error.',
                'errors' => [
                    'institution_name' => ['Institution name is required for institution clients.'],
                ],
            ], 422);
        }

        // 1) Block if already exists in approved clients
        $emailKey = $data['email_ci'] ?? mb_strtolower($data['email']);
        $clientExists = false;

        if (Schema::hasColumn('clients', 'email_ci')) {
            $clientExists = Client::where('email_ci', $emailKey)->whereNull('deleted_at')->exists();
        } else {
            // existing DB has unique index on LOWER(email) active; safe check:
            $clientExists = Client::whereRaw('LOWER(email) = ?', [$emailKey])->whereNull('deleted_at')->exists();
        }

        if ($clientExists) {
            return response()->json([
                'message' => 'Validation error.',
                'errors' => [
                    'email' => ['Account already exists. Please login instead.'],
                ],
            ], 422);
        }

        // 2) Block if a pending application already exists
        $pendingExists = ClientApplication::query()
            ->whereNull('deleted_at')
            ->where('status', 'pending')
            ->where(function ($q) use ($emailKey) {
                $q->where('email_ci', $emailKey)
                    ->orWhereRaw('LOWER(email) = ?', [$emailKey]);
            })
            ->exists();

        if ($pendingExists) {
            return response()->json([
                'message' => 'Validation error.',
                'errors' => [
                    'email' => ['Registration already submitted. Please wait for admin verification.'],
                ],
            ], 422);
        }

        try {
            $createPayload = [
                ...collect($data)->except(['password', 'password_confirmation'])->all(),
                'status' => 'pending',
                'password_hash' => Hash::make($data['password']),
            ];

            $app = ClientApplication::create($createPayload);
        } catch (QueryException $e) {
            // PostgreSQL unique violation: 23505
            $sqlState = $e->errorInfo[0] ?? null;
            if ($sqlState === '23505') {
                return response()->json([
                    'message' => 'Validation error.',
                    'errors' => [
                        'email' => ['Registration already submitted. Please wait for admin verification.'],
                    ],
                ], 422);
            }
            throw $e;
        }

        return response()->json([
            'message' => 'Client registration submitted. Waiting for admin verification.',
            'application' => [
                'id' => $app->client_application_id,
                'name' => $app->name,
                'email' => $app->email,
                'status' => $app->status,
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
        ], [
            'email.required' => 'Email is required.',
            'email.email' => 'Email format is invalid.',
            'password.required' => 'Password is required.',
        ]);

        $email = trim($data['email']);
        $emailKey = mb_strtolower($email);

        // Approved clients only live in clients table
        if (Schema::hasColumn('clients', 'email_ci')) {
            $client = Client::where('email_ci', $emailKey)->whereNull('deleted_at')->first();
        } else {
            $client = Client::whereRaw('LOWER(email) = ?', [$emailKey])->whereNull('deleted_at')->first();
        }

        if ($client) {
            if (!Hash::check($data['password'], $client->getAuthPassword())) {
                return response()->json(['message' => 'Invalid email or password.'], 401);
            }

            // Extra safety: if is_active exists and false, still block
            if (Schema::hasColumn('clients', 'is_active') && !(bool) $client->is_active) {
                return response()->json([
                    'message' => 'Your account is not verified yet. Please wait for admin verification.',
                ], 403);
            }

            $client->tokens()->delete();
            $device = $data['device_name'] ?? 'web';
            $token = $client->createToken($device)->plainTextToken;

            return response()->json([
                'token' => $token,
                'client' => [
                    'id' => $client->client_id,
                    'name' => $client->name,
                    'email' => $client->email,
                ],
            ], 200);
        }

        // If not in clients, check pending application to give a clear message
        $pending = ClientApplication::query()
            ->whereNull('deleted_at')
            ->where('status', 'pending')
            ->where(function ($q) use ($emailKey) {
                $q->where('email_ci', $emailKey)->orWhereRaw('LOWER(email) = ?', [$emailKey]);
            })
            ->first();

        if ($pending) {
            // Optional: you may verify password here, but better not leak info.
            return response()->json([
                'message' => 'Your registration is pending admin verification. Please wait for approval.',
            ], 403);
        }

        return response()->json(['message' => 'Invalid email or password.'], 401);
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

        if ($client) {
            $client->currentAccessToken()?->delete();
        }

        return response()->noContent();
    }
}