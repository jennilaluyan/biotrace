<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClientSampleDraftStoreRequest;
use App\Http\Requests\ClientSampleDraftUpdateRequest;
use App\Http\Requests\ClientSampleSubmitRequest;
use App\Models\Client;
use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ClientSampleRequestController extends Controller
{
    private function currentClientOr403(): Client
    {
        $actor = Auth::user();

        // Staff forbidden
        if ($actor instanceof Staff) {
            abort(403, 'Forbidden.');
        }

        if (!$actor instanceof Client) {
            abort(403, 'Forbidden.');
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

        // draft status
        if (Schema::hasColumn('samples', 'request_status')) {
            $sample->request_status = 'draft';
        }

        // sample_type wajib (karena schema kamu NOT NULL)
        if (Schema::hasColumn('samples', 'sample_type')) {
            $sample->sample_type = $data['sample_type'];
        }

        // received_at: kalau dikirim pakai, kalau tidak dikirim tapi kolom ada, set default now() (aman untuk NOT NULL)
        if (Schema::hasColumn('samples', 'received_at')) {
            $sample->received_at = $data['received_at'] ?? now();
        }

        // optional fields (schema-safe)
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

        // notes / additional_notes mapping
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

        // current_status minimal untuk workflow
        if (Schema::hasColumn('samples', 'current_status') && empty($sample->current_status)) {
            $sample->current_status = 'received';
        }

        // created_by / assigned_to jika mandatory
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

        // apply patch (schema-safe)
        foreach ($data as $k => $v) {
            if (Schema::hasColumn('samples', $k)) {
                $sample->{$k} = $v;
                continue;
            }

            // mapping notes -> additional_notes jika kolom notes tidak ada
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
     * submit request (must pass required fields)
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

        // Simpan field submit (schema-safe)
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

            // Pastikan FK staff tidak kosong jika schema menuntut
            $systemStaffId = $this->ensureSystemStaffId();
            if (Schema::hasColumn('samples', 'created_by') && empty($sample->created_by)) {
                $sample->created_by = $systemStaffId;
            }
            if (Schema::hasColumn('samples', 'assigned_to') && empty($sample->assigned_to)) {
                $sample->assigned_to = $systemStaffId;
            }

            $sample->save();

            // Audit log (FIX: staff_id NOT NULL)
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

    /**
     * Create/get system staff to satisfy FK samples.created_by / assigned_to (kalau mandatory)
     */
    private function ensureSystemStaffId(): int
    {
        // kalau tidak ada kebutuhan FK staff di samples, gak perlu bikin staff
        if (!Schema::hasColumn('samples', 'created_by') && !Schema::hasColumn('samples', 'assigned_to')) {
            return 1;
        }

        if (!Schema::hasTable('staffs')) {
            return 1;
        }

        $email = 'system_staff@lims.local';

        // Pastikan role ada (schema-safe)
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

        // Kalau staff sudah ada, pakai
        $existing = DB::table('staffs')->where('email', $email)->value('staff_id');
        if ($existing) {
            return (int) $existing;
        }

        // Insert staff schema-safe
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

        // fallback jika schema masih pakai "password"
        if (isset($cols['password']) && !isset($insert['password'])) {
            $insert['password'] = $insert['password_hash'] ?? bcrypt('secret');
        }

        DB::table('staffs')->insert($insert);

        return (int) DB::table('staffs')->where('email', $email)->value('staff_id');
    }
}
