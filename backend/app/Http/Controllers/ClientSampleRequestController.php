<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClientSampleDraftStoreRequest;
use App\Http\Requests\ClientSampleDraftUpdateRequest;
use App\Http\Requests\ClientSampleSubmitRequest;
use App\Models\Client;
use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ClientSampleRequestController extends Controller
{
    private function currentClientOr403(): Client
    {
        $actor = Auth::guard('client_api')->user();

        if (!$actor instanceof Client) {
            abort(401, 'Unauthenticated');
        }

        return $actor;
    }

    private function assertOwnedByClient(Client $client, Sample $sample): void
    {
        $clientId = (int) ($client->client_id ?? $client->getKey());
        if ((int) $sample->client_id !== $clientId) {
            abort(403, 'Forbidden.');
        }
    }

    /**
     * GET /api/v1/client/samples
     */
    public function index(Request $request): JsonResponse
    {
        $client = $this->currentClientOr403();
        $clientId = (int) ($client->client_id ?? $client->getKey());

        $rows = Sample::query()
            ->where('client_id', $clientId)
            ->orderByDesc('sample_id')
            ->paginate(15);

        return response()->json([
            'data' => $rows->items(),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page'    => $rows->lastPage(),
                'per_page'     => $rows->perPage(),
                'total'        => $rows->total(),
            ],
        ]);
    }

    /**
     * GET /api/v1/client/samples/{sample}
     * detail
     *
     * FIX: sebelumnya route memanggil show() tapi method tidak ada → 500 BadMethodCallException
     */
    public function show(Request $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        return response()->json([
            'data' => $sample->fresh(),
        ], 200);
    }

    /**
     * POST /api/v1/client/samples
     * create draft
     */
    public function store(ClientSampleDraftStoreRequest $request): JsonResponse
    {
        $client = $this->currentClientOr403();
        $clientId = (int) ($client->client_id ?? $client->getKey());
        $data = $request->validated();

        $sample = new Sample();
        $sample->client_id = $clientId;

        if (Schema::hasColumn('samples', 'request_status')) {
            $sample->request_status = 'draft';
        }

        if (Schema::hasColumn('samples', 'sample_type')) {
            $sample->sample_type = $data['sample_type'];
        }

        if (Schema::hasColumn('samples', 'received_at')) {
            $sample->received_at = $data['received_at'] ?? now();
        }

        if (Schema::hasColumn('samples', 'examination_purpose') && array_key_exists('examination_purpose', $data)) {
            $sample->examination_purpose = $data['examination_purpose'];
        }
        if (Schema::hasColumn('samples', 'contact_history') && array_key_exists('contact_history', $data)) {
            $sample->contact_history = $data['contact_history'];
        }
        if (Schema::hasColumn('samples', 'priority') && array_key_exists('priority', $data)) {
            $sample->priority = $data['priority'];
        } elseif (Schema::hasColumn('samples', 'priority') && $sample->priority === null) {
            $sample->priority = 0;
        }

        if (array_key_exists('notes', $data)) {
            if (Schema::hasColumn('samples', 'notes')) {
                $sample->notes = $data['notes'];
            } elseif (Schema::hasColumn('samples', 'additional_notes')) {
                $sample->additional_notes = $data['notes'];
            }
        }
        if (Schema::hasColumn('samples', 'additional_notes') && array_key_exists('additional_notes', $data)) {
            $sample->additional_notes = $data['additional_notes'];
        }

        if (Schema::hasColumn('samples', 'current_status') && empty($sample->current_status)) {
            $sample->current_status = 'received';
        }

        $systemStaffId = $this->ensureSystemStaffId();
        if (Schema::hasColumn('samples', 'created_by') && empty($sample->created_by)) {
            $sample->created_by = $systemStaffId;
        }
        if (Schema::hasColumn('samples', 'assigned_to') && empty($sample->assigned_to)) {
            $sample->assigned_to = $systemStaffId;
        }

        $sample->save();

        return response()->json([
            'data' => $sample->fresh(),
        ], 201);
    }

    /**
     * PATCH /api/v1/client/samples/{sample}
     * update draft/returned
     */
    public function update(ClientSampleDraftUpdateRequest $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        $status = (string) ($sample->request_status ?? 'draft');
        $allowed = ['draft', 'returned', 'needs_revision'];
        if (!in_array($status, $allowed, true)) {
            return response()->json([
                'message' => 'Only draft/returned requests can be updated.',
            ], 403);
        }

        $data = $request->validated();

        foreach ($data as $k => $v) {
            if (Schema::hasColumn('samples', $k)) {
                $sample->{$k} = $v;
                continue;
            }

            if ($k === 'notes' && Schema::hasColumn('samples', 'additional_notes')) {
                $sample->additional_notes = $v;
            }
        }

        $sample->save();

        return response()->json([
            'data' => $sample->fresh(),
        ], 200);
    }

    /**
     * POST /api/v1/client/samples/{sample}/submit
     */
    public function submit(ClientSampleSubmitRequest $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        $from = (string) ($sample->request_status ?? 'draft');
        $allowedFrom = ['draft', 'returned', 'needs_revision'];
        if (!in_array($from, $allowedFrom, true)) {
            return response()->json([
                'message' => 'This request cannot be submitted from current status.',
            ], 403);
        }

        $data = $request->validated();

        foreach ($data as $k => $v) {
            if (Schema::hasColumn('samples', $k)) {
                $sample->{$k} = $v;
                continue;
            }
            if ($k === 'notes' && Schema::hasColumn('samples', 'additional_notes')) {
                $sample->additional_notes = $v;
            }
        }

        DB::transaction(function () use ($sample, $from) {
            if (Schema::hasColumn('samples', 'request_status')) {
                $sample->request_status = 'submitted';
            }

            if (Schema::hasColumn('samples', 'submitted_at') && empty($sample->submitted_at)) {
                $sample->submitted_at = now();
            }

            $systemStaffId = $this->ensureSystemStaffId();
            if (Schema::hasColumn('samples', 'created_by') && empty($sample->created_by)) {
                $sample->created_by = $systemStaffId;
            }
            if (Schema::hasColumn('samples', 'assigned_to') && empty($sample->assigned_to)) {
                $sample->assigned_to = $systemStaffId;
            }

            $sample->save();

            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));

                $payload = [
                    'entity_name' => 'samples',
                    'entity_id'   => $sample->sample_id,
                    'action'      => 'CLIENT_SAMPLE_REQUEST_SUBMITTED',
                    'old_values'  => json_encode(['request_status' => $from]),
                    'new_values'  => json_encode(['request_status' => 'submitted']),
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];

                if (isset($cols['staff_id'])) {
                    $payload['staff_id'] = $this->ensureSystemStaffId();
                }

                DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
            }
        });

        return response()->json([
            'data' => $sample->fresh(),
        ], 200);
    }

    private function ensureSystemStaffId(): int
    {
        // If the schema doesn't support these fields, no need to create system staff.
        if (!Schema::hasColumn('samples', 'created_by') && !Schema::hasColumn('samples', 'assigned_to')) {
            return 1;
        }

        if (!Schema::hasTable('staffs')) {
            return 1;
        }

        $email = 'system_staff@lims.local';

        // If system staff already exists, return it fast.
        $existing = DB::table('staffs')->where('email', $email)->value('staff_id');
        if ($existing) {
            return (int) $existing;
        }

        // Ensure role exists in an idempotent way (no duplicate key explosions).
        $roleId = 1;

        if (Schema::hasTable('roles')) {
            $roleName = 'ADMIN';

            // 1) Case-insensitive read first (avoid "Admin" vs "ADMIN" mismatch)
            $roleId = (int) (
                DB::table('roles')
                ->whereRaw('LOWER(name) = ?', [strtolower($roleName)])
                ->value('role_id') ?: 0
            );

            // 2) If missing, try to ensure it exists (idempotent)
            if ($roleId <= 0) {
                $rolePayload = [
                    'name'        => $roleName,
                    'description' => 'System role',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];

                $roleCols   = array_flip(Schema::getColumnListing('roles'));
                $roleInsert = array_intersect_key($rolePayload, $roleCols);

                try {
                    // Prefer updateOrInsert by name (requires/assumes roles.name is UNIQUE for perfect safety)
                    DB::table('roles')->updateOrInsert(
                        ['name' => $roleName],
                        array_diff_key($roleInsert, ['name' => true]) // update fields except key
                    );
                } catch (\Throwable $e) {
                    // Fallback if roles.name isn't unique (or other constraint issues).
                    // Only insert if still missing in a case-insensitive way.
                    $exists = (int) (
                        DB::table('roles')
                        ->whereRaw('LOWER(name) = ?', [strtolower($roleName)])
                        ->count()
                    );

                    if ($exists === 0) {
                        // Last-resort insert without specifying role_id.
                        // If sequences are fixed (setval), this won't collide.
                        DB::table('roles')->insert($roleInsert);
                    }
                }

                // 3) Re-read role_id after ensuring existence
                $roleId = (int) (
                    DB::table('roles')
                    ->whereRaw('LOWER(name) = ?', [strtolower($roleName)])
                    ->value('role_id') ?: 0
                );

                // 4) Hard fallback: pick the first available role (better than crashing)
                if ($roleId <= 0) {
                    $roleId = (int) (DB::table('roles')->orderBy('role_id')->value('role_id') ?: 1);
                }
            }
        }

        // Create system staff if it doesn't exist (idempotent).
        $payload = [
            'name'          => 'System Staff',
            'email'         => $email,
            'password_hash' => bcrypt('secret'),
            'role_id'       => $roleId,
            'is_active'     => true,
            'created_at'    => now(),
            'updated_at'    => now(),
        ];

        $cols = array_flip(Schema::getColumnListing('staffs'));
        $insert = array_intersect_key($payload, $cols);

        // Backward compatibility: some schemas use "password" instead of "password_hash"
        if (isset($cols['password']) && !isset($insert['password'])) {
            $insert['password'] = $insert['password_hash'] ?? bcrypt('secret');
        }

        // Make staff creation idempotent too (needs UNIQUE on email, which is a reasonable assumption).
        DB::table('staffs')->updateOrInsert(
            ['email' => $email],
            array_diff_key($insert, ['email' => true])
        );

        return (int) (DB::table('staffs')->where('email', $email)->value('staff_id') ?: 1);
    }
}
