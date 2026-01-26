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

    private function syncRequestedParameters(Sample $sample, ?array $parameterIds): void
    {
        if (!Schema::hasTable('sample_requested_parameters')) return;
        if (!method_exists($sample, 'requestedParameters')) return;

        if ($parameterIds === null) return; // no change
        $ids = array_values(array_unique(array_map('intval', $parameterIds)));

        $sample->requestedParameters()->sync($ids);
    }

    /**
     * GET /api/v1/client/samples
     * Supports:
     * - status=request_status
     * - from/to (date filter on submitted_at)
     * - q (search)
     */
    public function index(Request $request): JsonResponse
    {
        $client = $this->currentClientOr403();
        $clientId = (int) ($client->client_id ?? $client->getKey());

        $query = Sample::query()
            ->where('client_id', $clientId)
            ->with(['requestedParameters']);

        if ($request->filled('status')) {
            $query->where('request_status', $request->string('status')->toString());
        }

        if ($request->filled('from')) {
            $query->whereDate('submitted_at', '>=', $request->get('from'));
        }

        if ($request->filled('to')) {
            $query->whereDate('submitted_at', '<=', $request->get('to'));
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->get('q'));
            if ($q !== '') {
                $query->where(function ($w) use ($q) {
                    $w->where('sample_type', 'ILIKE', "%{$q}%")
                        ->orWhere('additional_notes', 'ILIKE', "%{$q}%")
                        ->orWhere('request_status', 'ILIKE', "%{$q}%")
                        ->orWhere('lab_sample_code', 'ILIKE', "%{$q}%");
                });
            }
        }

        $rows = $query->orderByDesc('sample_id')->paginate(15);

        return response()->json([
            'data' => $rows->items(),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
        ]);
    }

    /**
     * GET /api/v1/client/samples/{sample}
     */
    public function show(Request $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        // IMPORTANT: jangan return fresh() setelah load, karena relasi hilang.
        $sample->load(['requestedParameters']);

        return response()->json([
            'data' => $sample,
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

        $sample->sample_type = $data['sample_type'];

        if (Schema::hasColumn('samples', 'scheduled_delivery_at') && array_key_exists('scheduled_delivery_at', $data)) {
            $sample->scheduled_delivery_at = $data['scheduled_delivery_at'];
        }

        if (Schema::hasColumn('samples', 'examination_purpose') && array_key_exists('examination_purpose', $data)) {
            $sample->examination_purpose = $data['examination_purpose'];
        }

        if (Schema::hasColumn('samples', 'additional_notes') && array_key_exists('additional_notes', $data)) {
            $sample->additional_notes = $data['additional_notes'];
        }

        if (Schema::hasColumn('samples', 'current_status') && empty($sample->current_status)) {
            // keep legacy lab workflow constraint happy
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

        $this->syncRequestedParameters($sample, $data['parameter_ids'] ?? null);

        // Reload + load relation, dan return model yang sudah ada relasinya.
        $sample->refresh()->load(['requestedParameters']);

        return response()->json([
            'data' => $sample,
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
            if ($k === 'parameter_ids') continue;
            if (Schema::hasColumn('samples', $k)) {
                $sample->{$k} = $v;
            }
        }

        $sample->save();

        $this->syncRequestedParameters($sample, $data['parameter_ids'] ?? null);

        $sample->refresh()->load(['requestedParameters']);

        return response()->json([
            'data' => $sample,
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

        DB::transaction(function () use ($sample, $from, $data) {
            // update fields before submit
            $sample->sample_type = $data['sample_type'];

            if (Schema::hasColumn('samples', 'scheduled_delivery_at')) {
                $sample->scheduled_delivery_at = $data['scheduled_delivery_at'];
            }
            if (Schema::hasColumn('samples', 'examination_purpose')) {
                $sample->examination_purpose = $data['examination_purpose'] ?? null;
            }
            if (Schema::hasColumn('samples', 'additional_notes')) {
                $sample->additional_notes = $data['additional_notes'] ?? null;
            }

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

            $this->syncRequestedParameters($sample, $data['parameter_ids'] ?? []);

            // optional audit log (schema-safe)
            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));
                $payload = [
                    'entity_name' => 'samples',
                    'entity_id' => $sample->sample_id,
                    'action' => 'CLIENT_SAMPLE_REQUEST_SUBMITTED',
                    'old_values' => json_encode(['request_status' => $from]),
                    'new_values' => json_encode(['request_status' => 'submitted']),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                if (isset($cols['staff_id'])) {
                    $payload['staff_id'] = $this->ensureSystemStaffId();
                }
                DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
            }
        });

        $sample->refresh()->load(['requestedParameters']);

        return response()->json([
            'data' => $sample,
        ], 200);
    }

    private function ensureSystemStaffId(): int
    {
        if (!Schema::hasColumn('samples', 'created_by') && !Schema::hasColumn('samples', 'assigned_to')) {
            return 1;
        }
        if (!Schema::hasTable('staffs')) {
            return 1;
        }

        $email = 'system_staff@lims.local';
        $existing = DB::table('staffs')->where('email', $email)->value('staff_id');
        if ($existing) {
            return (int) $existing;
        }

        $roleId = 1;
        if (Schema::hasTable('roles')) {
            $roleName = 'ADMIN';
            $roleId = (int) (
                DB::table('roles')
                ->whereRaw('LOWER(name) = ?', [strtolower($roleName)])
                ->value('role_id') ?: 0
            );

            if ($roleId <= 0) {
                $rolePayload = [
                    'name' => $roleName,
                    'description' => 'System role',
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                $roleCols = array_flip(Schema::getColumnListing('roles'));
                $roleInsert = array_intersect_key($rolePayload, $roleCols);

                try {
                    DB::table('roles')->updateOrInsert(
                        ['name' => $roleName],
                        array_diff_key($roleInsert, ['name' => true])
                    );
                } catch (\Throwable $e) {
                    $exists = (int) (
                        DB::table('roles')
                        ->whereRaw('LOWER(name) = ?', [strtolower($roleName)])
                        ->count()
                    );
                    if ($exists === 0) {
                        DB::table('roles')->insert($roleInsert);
                    }
                }

                $roleId = (int) (
                    DB::table('roles')
                    ->whereRaw('LOWER(name) = ?', [strtolower($roleName)])
                    ->value('role_id') ?: 0
                );

                if ($roleId <= 0) {
                    $roleId = (int) (DB::table('roles')->orderBy('role_id')->value('role_id') ?: 1);
                }
            }
        }

        $payload = [
            'name' => 'System Staff',
            'email' => $email,
            'password_hash' => bcrypt('secret'),
            'role_id' => $roleId,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        $cols = array_flip(Schema::getColumnListing('staffs'));
        $insert = array_intersect_key($payload, $cols);

        if (isset($cols['password']) && !isset($insert['password'])) {
            $insert['password'] = $insert['password_hash'] ?? bcrypt('secret');
        }

        DB::table('staffs')->updateOrInsert(
            ['email' => $email],
            array_diff_key($insert, ['email' => true])
        );

        return (int) (DB::table('staffs')->where('email', $email)->value('staff_id') ?: 1);
    }
}