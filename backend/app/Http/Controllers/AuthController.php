<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Support\AuditLogger;

class AuthController extends Controller
{
    // POST /api/v1/auth/login
    // POST /api/v1/auth/login
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'       => ['required', 'email'],
            'password'    => ['required', 'string'],
            'device_name' => ['nullable', 'string'], // optional: token untuk Postman
        ]);

        $user = Staff::where('email', $data['email'])->first();

        // =====================
        // GAGAL: kredensial salah
        // =====================
        if (! $user || ! Hash::check($data['password'], $user->getAuthPassword())) {
            AuditLogger::write(
                'LOGIN_FAILURE',
                null,              // staff_id belum tahu
                'staffs',          // entity_name
                null,              // entity_id
                null,              // old_values
                [
                    'email'  => $data['email'],
                    'reason' => 'INVALID_CREDENTIALS',
                ]
            );

            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        // =====================
        // GAGAL: akun non-aktif
        // =====================
        if (! $user->is_active) {
            AuditLogger::write(
                'LOGIN_FAILURE',
                $user->getKey(),   // staff_id actor
                'staffs',
                $user->getKey(),
                null,
                [
                    'email'  => $data['email'],
                    'reason' => 'ACCOUNT_INACTIVE',
                ]
            );

            return response()->json(['message' => 'Account inactive'], 403);
        }

        // =====================
        // LOGIN via SESSION (browser SPA)
        // =====================
        // 👉 JANGAN pakai if ($request->hasSession())
        // Langsung login ke guard web dan regenerate session.
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
            // kebijakan: 1 user = 1 active token
            $user->tokens()->delete();

            $tokenInstance = $user->createToken($data['device_name']);
            $token = $tokenInstance->plainTextToken;
        }

        // =====================
        // LOGIN_SUCCESS → catat audit
        // =====================
        AuditLogger::write(
            'LOGIN_SUCCESS',
            $user->getKey(),      // staff_id
            'staffs',
            $user->getKey(),      // entity_id
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
            // null untuk browser (cookie), string token untuk Postman
            'token' => $token,
        ], 200);
    }


    // GET /api/v1/auth/me
    public function me(Request $request)
    {
        $user = $request->user(); // bisa dari session atau token Sanctum

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $role = $user->role()->select('role_id', 'name')->first();

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
        ], 200);
    }

    // POST /api/v1/auth/logout
    public function logout(Request $request)
    {
        $user = $request->user();
        $tokenId = null;

        // kalau logout pakai Bearer token (Postman)
        if ($user && method_exists($user, 'currentAccessToken')) {
            $token = $user->currentAccessToken();

            if ($token && ! $token instanceof \Laravel\Sanctum\TransientToken) {
                $tokenId = $token->id;
                $token->delete();
            }
        }

        // AUDIT: LOGOUT sebelum session dihancurkan
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

        // logout session (cookie flow)
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }
}
