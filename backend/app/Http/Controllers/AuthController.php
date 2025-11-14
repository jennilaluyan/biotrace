<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    // POST /api/v1/auth/login
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string'], // optional: kalau mau token untuk Postman
        ]);

        // Cari staff by email
        $user = Staff::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->getAuthPassword())) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'Account inactive'], 403);
        }

        // 🔹 1) Login-kan user ke SESSION (cookie flow / Sanctum SPA)
        Auth::login($user);
        $request->session()->regenerate();

        // Ambil role (optional)
        $role = $user->role()->select('role_id', 'name')->first();

        // 🔹 2) Kalau minta token (Postman), buatkan token
        $token = null;
        if (! empty($data['device_name'])) {
            // kebijakan: 1 user = 1 token? kalau mau, hapus semua dulu
            $user->tokens()->delete();

            $token = $user->createToken($data['device_name'])->plainTextToken;
        }

        // 🔹 3) Response:
        // - untuk browser SPA, yang penting cookie laravel_session sudah ter-set
        // - untuk Postman, dia dapat token di body
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
            'token' => $token, // bisa null kalau login dari browser biasa
        ], 200);
    }

    // GET /api/v1/auth/me
    public function me(Request $request)
    {
        $user = $request->user(); // dari Sanctum (token atau session)

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
        $user = $request->user(); // bisa via token atau via session

        // 1) Revoke API token HANYA jika ini benar-benar PersonalAccessToken
        if ($user && method_exists($user, 'currentAccessToken')) {
            $token = $user->currentAccessToken();

            // Untuk SPA (cookie) -> TransientToken, JANGAN di-delete
            // Untuk Bearer token (Postman) -> PersonalAccessToken, BOLEH di-delete
            if ($token && ! $token instanceof \Laravel\Sanctum\TransientToken) {
                $token->delete();
            }
        }

        // 2) Putuskan SESSION (cookie flow)
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        // 3) Tetap balas 204 No Content
        return response()->noContent();
    }
}
