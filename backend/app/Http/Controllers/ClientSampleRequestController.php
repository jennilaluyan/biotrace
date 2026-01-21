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
        if (!Schema::hasColumn('samples', 'created_by') && !Schema::hasColumn('samples', 'assigned_to')) {
            return 1;
        }

        if (!Schema::hasTable('staffs')) {
            return 1;
        }

        $email = 'system_staff@lims.local';

        $roleId = 1;
        if (Schema::hasTable('roles')) {
            $roleName = 'ADMIN';
            $roleId = (int) (DB::table('roles')->where('name', $roleName)->value('role_id') ?: 0);

            if ($roleId <= 0) {
                $rolePayload = [
                    'name'        => $roleName,
                    'description' => 'System role',
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];

                $roleCols = array_flip(Schema::getColumnListing('roles'));
                $roleInsert = array_intersect_key($rolePayload, $roleCols);

                $roleId = (int) DB::table('roles')->insertGetId($roleInsert, 'role_id');
            }
        }

        $existing = DB::table('staffs')->where('email', $email)->value('staff_id');
        if ($existing) {
            return (int) $existing;
        }

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

        if (isset($cols['password']) && !isset($insert['password'])) {
            $insert['password'] = $insert['password_hash'] ?? bcrypt('secret');
        }

        DB::table('staffs')->insert($insert);

        return (int) DB::table('staffs')->where('email', $email)->value('staff_id');
    }
}
