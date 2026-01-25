<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\ClientApplication;
use App\Support\ApiResponse;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ClientVerificationController extends Controller
{
    /**
     * Only Administrator can approve/reject.
     */
    protected function ensureAdmin(Request $request): void
    {
        $user = $request->user();
        $roleId = (int) ($user?->role_id ?? 0);
        $roleName = strtolower((string) ($user?->role?->name ?? ''));

        // Your ROLE_ID.ADMIN looks like 2 in your system.
        if ($roleId !== 2 && $roleName !== 'administrator') {
            abort(
                ApiResponse::error(
                    message: 'Only Administrator can verify client accounts.',
                    code: 'FORBIDDEN',
                    status: 403,
                    options: ['resource' => 'client_applications']
                )
            );
        }
    }

    /**
     * GET /api/v1/clients/pending
     * List pending client applications only.
     */
    public function pending(Request $request)
    {
        $this->ensureAdmin($request);

        $perPage = (int) $request->query('per_page', 20);

        $q = ClientApplication::query()
            ->where('status', 'pending')
            ->orderByDesc('client_application_id');

        if ($type = $request->query('type')) {
            $q->where('type', $type);
        }

        if ($search = $request->query('q')) {
            $q->where(function ($w) use ($search) {
                $w->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%")
                    ->orWhere('phone', 'ilike', "%{$search}%")
                    ->orWhere('institution_name', 'ilike', "%{$search}%");
            });
        }

        $data = $q->paginate($perPage);

        return ApiResponse::success(
            data: $data,
            message: 'Pending client applications fetched successfully.',
            status: 200,
            extra: ['resource' => 'client_applications']
        );
    }

    /**
     * POST /api/v1/clients/{applicationId}/approve
     * Approve = create row in clients, then DELETE application (so table only keeps pending+rejected).
     */
    public function approve(Request $request, int $applicationId)
    {
        $this->ensureAdmin($request);

        $staff = $request->user();

        $createdClient = null;

        DB::transaction(function () use ($applicationId, $staff, &$createdClient) {
            // Lock row to prevent double-approve race condition
            $app = ClientApplication::query()
                ->where('client_application_id', $applicationId)
                ->lockForUpdate()
                ->first();

            if (!$app) {
                abort(
                    ApiResponse::error(
                        message: 'Client application not found.',
                        code: 'NOT_FOUND',
                        status: 404,
                        options: ['resource' => 'client_applications']
                    )
                );
            }

            if ($app->status !== 'pending') {
                // If it's already rejected/approved, do not create another client
                abort(
                    ApiResponse::error(
                        message: 'This application is not pending anymore.',
                        code: 'NOT_PENDING',
                        status: 409,
                        options: [
                            'client_application_id' => $app->client_application_id,
                            'status' => $app->status,
                        ]
                    )
                );
            }

            // Prevent duplicate client by email_ci/email (case-insensitive)
            $emailCi = null;

            if (Schema::hasColumn('clients', 'email_ci')) {
                $emailCi = mb_strtolower((string) $app->email);

                $exists = Client::query()
                    ->whereNull('deleted_at')
                    ->where('email_ci', $emailCi)
                    ->exists();

                if ($exists) {
                    abort(
                        ApiResponse::error(
                            message: 'Email already exists in clients.',
                            code: 'EMAIL_EXISTS',
                            status: 422,
                            options: ['field' => 'email']
                        )
                    );
                }
            } else {
                $exists = Client::query()
                    ->whereNull('deleted_at')
                    ->where('email', $app->email)
                    ->exists();

                if ($exists) {
                    abort(
                        ApiResponse::error(
                            message: 'Email already exists in clients.',
                            code: 'EMAIL_EXISTS',
                            status: 422,
                            options: ['field' => 'email']
                        )
                    );
                }
            }

            // Create client
            $payload = [
                'type' => $app->type,
                'name' => $app->name,
                'phone' => $app->phone,
                'email' => $app->email,
                'staff_id' => null,

                // move password hash from application
                'password_hash' => $app->password_hash,

                // approved client becomes active
                'is_active' => true,

                // optional fields
                'national_id' => $app->national_id ?? null,
                'date_of_birth' => $app->date_of_birth ?? null,
                'gender' => $app->gender ?? null,
                'address_ktp' => $app->address_ktp ?? null,
                'address_domicile' => $app->address_domicile ?? null,

                'institution_name' => $app->institution_name ?? null,
                'institution_address' => $app->institution_address ?? null,
                'contact_person_name' => $app->contact_person_name ?? null,
                'contact_person_phone' => $app->contact_person_phone ?? null,
                'contact_person_email' => $app->contact_person_email ?? null,
            ];

            if (Schema::hasColumn('clients', 'email_ci')) {
                $payload['email_ci'] = $emailCi;
            }

            $createdClient = Client::create($payload);

            // ✅ IMPORTANT: delete application so table contains only pending+rejected
            $app->delete();

            AuditLogger::write(
                'CLIENT_APPLICATION_APPROVED',
                $staff?->id,
                'client_applications',
                $applicationId,
                null,
                ['email' => $payload['email'], 'created_client_id' => $createdClient->client_id]
            );
        });

        return ApiResponse::success(
            data: [
                'status' => 'approved',
                'client_id' => $createdClient?->client_id,
            ],
            message: 'Client application approved and client created.',
            status: 200
        );
    }

    /**
     * POST /api/v1/clients/{applicationId}/reject
     * Reject = keep application, mark as rejected.
     */
    public function reject(Request $request, int $applicationId)
    {
        $this->ensureAdmin($request);

        $staff = $request->user();

        $app = ClientApplication::query()->where('client_application_id', $applicationId)->first();
        if (!$app) {
            return ApiResponse::error(
                message: 'Client application not found.',
                code: 'NOT_FOUND',
                status: 404,
                options: ['resource' => 'client_applications']
            );
        }

        if ($app->status !== 'pending') {
            return ApiResponse::success(
                data: [
                    'client_application_id' => $app->client_application_id,
                    'status' => $app->status,
                ],
                message: 'Application already decided.',
                status: 200
            );
        }

        $reason = (string) ($request->input('reason') ?? '');

        $app->status = 'rejected';

        if (Schema::hasColumn('client_applications', 'rejected_at')) {
            $app->rejected_at = now();
        }
        if (Schema::hasColumn('client_applications', 'rejected_by')) {
            $app->rejected_by = $staff?->id ?? null;
        }
        if (Schema::hasColumn('client_applications', 'reject_reason')) {
            $app->reject_reason = $reason ?: null;
        }

        $app->save();

        AuditLogger::write(
            'CLIENT_APPLICATION_REJECTED',
            $staff?->id,
            'client_applications',
            $app->client_application_id,
            null,
            ['email' => $app->email, 'reason' => $reason ?: null]
        );

        return ApiResponse::success(
            data: [
                'client_application_id' => $app->client_application_id,
                'status' => $app->status,
            ],
            message: 'Client application rejected.',
            status: 200
        );
    }
}