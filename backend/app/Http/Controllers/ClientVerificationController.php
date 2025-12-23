<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class ClientVerificationController extends Controller
{
    /**
     * Pastikan yang bisa verifikasi client hanya Administrator.
     * (Kamu sudah punya roles table: Administrator = role_id 2)
     */
    protected function ensureAdmin(Request $request): void
    {
        $user = $request->user();

        // fallback aman: cek role_id (admin = 2) atau role name "Administrator"
        $roleId = (int) ($user?->role_id ?? 0);
        $roleName = strtolower((string) ($user?->role?->name ?? ''));

        if ($roleId !== 2 && $roleName !== 'administrator') {
            abort(
                ApiResponse::error(
                    message: 'Only Administrator can verify client accounts.',
                    code: 'FORBIDDEN',
                    status: 403,
                    options: ['resource' => 'clients']
                )
            );
        }
    }

    /**
     * GET /api/v1/clients/pending
     * List client yang register tapi belum aktif (menunggu verifikasi admin).
     */
    public function pending(Request $request)
    {
        $this->ensureAdmin($request);

        $perPage = (int) $request->query('per_page', 20);

        $q = Client::query()
            ->where('is_active', false)
            ->whereNull('deleted_at')
            ->orderByDesc('created_at');

        if ($type = $request->query('type')) {
            $q->where('type', $type);
        }

        if ($search = $request->query('q')) {
            $q->where(function ($w) use ($search) {
                $w->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%")
                    ->orWhere('phone', 'ilike', "%{$search}%");
            });
        }

        $data = $q->paginate($perPage);

        return ApiResponse::success(
            data: $data,
            message: 'Pending clients fetched successfully.',
            status: 200,
            extra: ['resource' => 'clients']
        );
    }

    /**
     * POST /api/v1/clients/{client}/approve
     * Aktifkan client (admin verification).
     */
    public function approve(Request $request, Client $client)
    {
        $this->ensureAdmin($request);

        if ($client->deleted_at !== null) {
            return ApiResponse::error(
                message: 'Client account has been deleted.',
                code: 'CLIENT_DELETED',
                status: 404,
                options: ['resource' => 'clients']
            );
        }

        if ((bool) $client->is_active === true) {
            return ApiResponse::success(
                data: [
                    'client_id' => $client->client_id,
                    'name' => $client->name,
                    'email' => $client->email,
                    'is_active' => (bool) $client->is_active,
                ],
                message: 'Client already active.',
                status: 200,
                extra: ['resource' => 'clients']
            );
        }

        // kalau staff_id masih null, set sebagai admin yang memverifikasi (optional tapi berguna utk audit/PIC)
        if (empty($client->staff_id) && $request->user()) {
            $client->staff_id = $request->user()->staff_id ?? $request->user()->getAuthIdentifier();
        }

        $client->is_active = true;
        $client->save();

        return ApiResponse::success(
            data: [
                'client' => [
                    'client_id' => $client->client_id,
                    'name' => $client->name,
                    'email' => $client->email,
                    'phone' => $client->phone,
                    'type' => $client->type,
                    'is_active' => (bool) $client->is_active,
                    'staff_id' => $client->staff_id,
                ],
            ],
            message: 'Client verified successfully.',
            status: 200,
            extra: ['resource' => 'clients']
        );
    }

    /**
     * POST /api/v1/clients/{client}/reject
     * Tolak pendaftaran client -> soft delete record.
     */
    public function reject(Request $request, Client $client)
    {
        $this->ensureAdmin($request);

        if ($client->deleted_at !== null) {
            return ApiResponse::success(
                data: [
                    'client_id' => $client->client_id,
                    'deleted_at' => $client->deleted_at,
                ],
                message: 'Client already rejected (deleted).',
                status: 200,
                extra: ['resource' => 'clients']
            );
        }

        $client->delete();

        return ApiResponse::success(
            data: [
                'client_id' => $client->client_id,
            ],
            message: 'Client registration rejected (soft deleted).',
            status: 200,
            extra: ['resource' => 'clients']
        );
    }
}
