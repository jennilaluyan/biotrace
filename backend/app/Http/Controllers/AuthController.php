<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Support\AuditLogger;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Schema;

class AuthController extends Controller
{
    // POST /api/v1/auth/login
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'       => ['required', 'email'],
            'password'    => ['required', 'string'],
            'device_name' => ['nullable', 'string'], // optional: token untuk Postman
        ]);

        // Normalize email (trim + lower for lookup)
        $email = mb_strtolower(trim($data['email']));

        // Find staff case-insensitive (robust for DB uniqueness rules)
        $user = Staff::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        // Resolve password hash column safely
        $hash = null;

        if ($user) {
            // preferred schema: password_hash
            if (Schema::hasColumn('staffs', 'password_hash')) {
                $hash = $user->password_hash;
            }

            // fallback: some schemas might use 'password'
            if (!$hash && Schema::hasColumn('staffs', 'password')) {
                $hash = $user->password;
            }

            // last resort: model may implement getAuthPassword properly
            if (!$hash && method_exists($user, 'getAuthPassword')) {
                $hash = $user->getAuthPassword();
            }
        }

        // =====================
        // FAIL: invalid credentials
        // =====================
        if (! $user || ! $hash || ! Hash::check($data['password'], $hash)) {
            AuditLogger::write(
                'LOGIN_FAILURE',
                null,              // staff_id belum tahu
                'staffs',          // entity_name
                null,              // entity_id
                null,              // old_values
                [
                    'email'  => $email,
                    'reason' => 'INVALID_CREDENTIALS',
                ]
            );

            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        // =====================
        // FAIL: inactive
        // =====================
        if (! $user->is_active) {
            AuditLogger::write(
                'LOGIN_FAILURE',
                $user->getKey(),
                'staffs',
                $user->getKey(),
                null,
                [
                    'email'  => $email,
                    'reason' => 'ACCOUNT_INACTIVE',
                ]
            );

            return response()->json(['message' => 'Account inactive'], 403);
        }

        // =====================
        // LOGIN via SESSION (browser SPA)
        // =====================
        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        // role user
        $role = $user->role()->select('role_id', 'name')->first();

        // =====================
        // LOGIN via API TOKEN (Postman)
        // =====================
        $token = null;

        if (! empty($data['device_name'])) {
            $user->tokens()->delete();

            $tokenInstance = $user->createToken($data['device_name']);
            $token = $tokenInstance->plainTextToken;
        }

        AuditLogger::write(
            'LOGIN_SUCCESS',
            $user->getKey(),
            'staffs',
            $user->getKey(),
            null,
            [
                'email'       => $user->email,
                'via'         => empty($data['device_name']) ? 'browser_session' : 'api_token',
                'device_name' => $data['device_name'] ?? null,
            ]
        );

        return response()->json([
            'user' => [
                'id'    => $user->getKey(),
                'name'  => $user->name ?? $user->full_name ?? null,
                'email' => $user->email,
                'role'  => $role
                    ? [
                        'id'   => $role->role_id,
                        'name' => $role->name,
                    ]
                    : null,
            ],
            'token' => $token,
        ], 200);
    }

    // GET /api/v1/auth/me
    public function me(Request $request)
    {
        $user = $request->user('sanctum') ?? Auth::guard('web')->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $role = $user->role()->select('role_id', 'name')->first();

        return response()->json([
            'user' => [
                'id'    => $user->getKey(),
                'name'  => $user->name ?? $user->full_name ?? null,
                'email' => $user->email,
                'role'  => $role ? [
                    'id'   => $role->role_id,
                    'name' => $role->name,
                ] : null,
            ],
        ], 200);
    }

    // POST /api/v1/auth/logout
    public function logout(Request $request)
    {
        $user = $request->user();
        $tokenId = null;

        if ($user && method_exists($user, 'currentAccessToken')) {
            $token = $user->currentAccessToken();

            if ($token && ! $token instanceof \Laravel\Sanctum\TransientToken) {
                $tokenId = $token->id;
                $token->delete();
            }
        }

        AuditLogger::write(
            'LOGOUT',
            $user?->getKey(),
            'staffs',
            $user?->getKey(),
            null,
            [
                'email'    => $user?->email,
                'token_id' => $tokenId,
                'via'      => $tokenId ? 'api_token' : 'browser_session',
            ]
        );

        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'role_id' => [
                'required',
                'integer',
                Rule::in([2, 3, 4, 5]),
            ],
        ]);

        $exists = Staff::whereRaw('LOWER(email) = ?', [strtolower($data['email'])])->exists();
        if ($exists) {
            return response()->json(['message' => 'Email already registered'], 422);
        }

        $staff = Staff::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password_hash' => Hash::make($data['password']),
            'role_id' => $data['role_id'],
            'is_active' => false,
        ]);

        AuditLogger::write(
            'STAFF_REGISTER',
            $staff->getKey(),
            'staffs',
            $staff->getKey(),
            null,
            [
                'email' => $staff->email,
                'role_id' => $staff->role_id,
                'status' => 'PENDING_LAB_HEAD_APPROVAL',
            ]
        );

        return response()->json([
            'message' => 'Registration submitted. Waiting for Laboratory Head approval.',
            'user' => [
                'id' => $staff->getKey(),
                'name' => $staff->name,
                'email' => $staff->email,
                'role_id' => $staff->role_id,
                'is_active' => $staff->is_active,
            ],
        ], 201);
    }
}
