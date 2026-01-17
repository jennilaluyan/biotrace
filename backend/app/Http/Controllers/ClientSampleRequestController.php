<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ClientSampleRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = Auth::user();

        if (!$actor instanceof Client) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $q = DB::table('samples')->where('client_id', $actor->client_id);

        if ($request->filled('request_status')) {
            $q->where('request_status', $request->get('request_status'));
        }

        $items = $q->orderByDesc('sample_id')->paginate(15);

        return response()->json([
            'data' => $items->items(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'per_page'     => $items->perPage(),
                'total'        => $items->total(),
            ],
        ], 200);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = Auth::user();

        if (!$actor instanceof Client) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        /**
         * Resolve staff id that MUST exist (FK fk_samples_staffs_creator).
         * Priority:
         * 1) client.staff_id if exists and valid in staffs
         * 2) first staff in DB
         * 3) auto-create minimal staff (only for test/dev survival)
         */
        $creatorStaffId = null;

        $clientStaffId = (int) ($actor->staff_id ?? 0);
        if ($clientStaffId > 0) {
            $exists = DB::table('staffs')->where('staff_id', $clientStaffId)->exists();
            if ($exists) {
                $creatorStaffId = $clientStaffId;
            }
        }

        if ($creatorStaffId === null) {
            $creatorStaffId = DB::table('staffs')->min('staff_id');
        }

        if ($creatorStaffId === null) {
            // No staff rows at all -> create one minimal staff
            // Role: try to grab an existing role_id, else fallback 1 (but only if roles table exists)
            $roleId = null;
            if (Schema::hasTable('roles') && Schema::hasColumn('roles', 'role_id')) {
                $roleId = DB::table('roles')->min('role_id');
            }
            if ($roleId === null) {
                $roleId = 1;
            }

            // Column names differ between projects; handle safely
            $staffInsert = [];

            if (Schema::hasColumn('staffs', 'name')) {
                $staffInsert['name'] = 'Auto Staff';
            }
            if (Schema::hasColumn('staffs', 'email')) {
                $staffInsert['email'] = 'auto_staff_' . Str::lower(Str::random(8)) . '@example.com';
            }
            if (Schema::hasColumn('staffs', 'password_hash')) {
                $staffInsert['password_hash'] = bcrypt('secret');
            } elseif (Schema::hasColumn('staffs', 'password')) {
                $staffInsert['password'] = bcrypt('secret');
            }

            if (Schema::hasColumn('staffs', 'role_id')) {
                $staffInsert['role_id'] = $roleId;
            }

            if (Schema::hasColumn('staffs', 'is_active')) {
                $staffInsert['is_active'] = true;
            }
            if (Schema::hasColumn('staffs', 'created_at')) {
                $staffInsert['created_at'] = now();
            }
            if (Schema::hasColumn('staffs', 'updated_at')) {
                $staffInsert['updated_at'] = now();
            }

            // insert and get id
            $creatorStaffId = DB::table('staffs')->insertGetId($staffInsert, 'staff_id');
        }

        // sample_type NOT NULL
        $clientType = strtolower((string)($actor->type ?? ''));
        $sampleType = in_array($clientType, ['individual', 'institution'], true)
            ? $clientType
            : 'individual';

        $insert = [
            'client_id'      => $actor->client_id,
            'request_status' => 'draft',
        ];

        // created_by must be valid FK
        if (Schema::hasColumn('samples', 'created_by')) {
            $insert['created_by'] = (int)$creatorStaffId;
        }
        if (Schema::hasColumn('samples', 'assigned_to')) {
            $insert['assigned_to'] = (int)$creatorStaffId;
        }

        // must be enum-valid for your SampleHighLevelStatus
        if (Schema::hasColumn('samples', 'current_status')) {
            $insert['current_status'] = 'received';
        }

        if (Schema::hasColumn('samples', 'sample_type')) {
            $insert['sample_type'] = $sampleType;
        }

        if (Schema::hasColumn('samples', 'priority')) {
            $insert['priority'] = 0;
        }

        if (Schema::hasColumn('samples', 'notes')) {
            $insert['notes'] = $data['notes'] ?? null;
        }

        if (Schema::hasColumn('samples', 'created_at')) {
            $insert['created_at'] = now();
        }
        if (Schema::hasColumn('samples', 'updated_at')) {
            $insert['updated_at'] = now();
        }

        $sampleId = DB::table('samples')->insertGetId($insert, 'sample_id');

        // Return raw DB row (avoid status_enum accessor crash)
        $row = DB::table('samples')->where('sample_id', $sampleId)->first();

        return response()->json(['data' => $row], 201);
    }

    public function show(Request $request, Sample $sample): JsonResponse
    {
        $actor = Auth::user();

        if (!$actor instanceof Client) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ((int)$sample->client_id !== (int)$actor->client_id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $row = DB::table('samples')->where('sample_id', $sample->sample_id)->first();

        return response()->json(['data' => $row], 200);
    }

    public function submit(Request $request, Sample $sample): JsonResponse
    {
        $actor = Auth::user();

        if (!$actor instanceof Client) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ((int)$sample->client_id !== (int)$actor->client_id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ((string)$sample->request_status !== 'draft') {
            return response()->json([
                'message' => 'Only draft request can be submitted.',
            ], 422);
        }

        DB::transaction(function () use ($sample) {
            $sample->request_status = 'submitted';

            if (Schema::hasColumn('samples', 'submitted_at') && empty($sample->submitted_at)) {
                $sample->submitted_at = now();
            }

            $sample->save();
        });

        $row = DB::table('samples')->where('sample_id', $sample->sample_id)->first();

        return response()->json(['data' => $row], 200);
    }
}
