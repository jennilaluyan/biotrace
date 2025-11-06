<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    // POST /api/v1/auth/login
    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = Staff::where('email', $data['email'])->first();

        // Uniform error to avoid user enumeration
        if (!$user || !Hash::check($data['password'], $user->getAuthPassword())) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'Account inactive'], 403);
        }

        // Include role code/name for client UI
        $role = $user->role()->select('code', 'name')->first();

        // Issue Sanctum token
        $token = $user->createToken('api-token')->plainTextToken;

        return response()->json([
            'user'  => [
                'id'    => $user->getKey(),
                'name'  => $user->name ?? $user->full_name ?? null,
                'email' => $user->email,
                'role'  => $role ? ['code' => $role->code, 'name' => $role->name] : null,
            ],
            'token' => $token,
        ], 200);
    }

    // GET /api/v1/auth/me
    public function me(Request $request)
    {
        $user = $request->user(); // Sanctum resolves Staff model
        $role = $user->role()->select('code', 'name')->first();

        return response()->json([
            'user' => [
                'id'    => $user->getKey(),
                'name'  => $user->name ?? $user->full_name ?? null,
                'email' => $user->email,
                'role'  => $role ? ['code' => $role->code, 'name' => $role->name] : null,
            ],
        ], 200);
    }

    // POST /api/v1/auth/logout
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(null, 204);
    }
}
