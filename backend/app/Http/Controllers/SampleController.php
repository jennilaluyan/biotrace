<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleStatusUpdateRequest;
use App\Http\Requests\SampleStoreRequest;
use App\Models\Sample;
use App\Models\Staff;
use App\Support\SampleStatusTransitions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Support\AuditLogger;
use App\Enums\SampleHighLevelStatus;
use Illuminate\Support\Facades\Schema;

class SampleController extends Controller
{
    public function __construct()
    {
        // Otomatis hubungkan ke SamplePolicy:
        // - index() -> viewAny
        // - show()  -> view
        // - store() -> create
        $this->authorizeResource(Sample::class, 'sample');
    }

    /**
     * Tampilkan daftar samples (dengan filter sederhana).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Sample::query()
            ->with(['client', 'creator', 'assignee']);

        // Filter by client_id
        if ($request->filled('client_id')) {
            $query->where('client_id', $request->integer('client_id'));
        }

        // Filter by high-level status_enum (registered/testing/reported)
        if ($request->filled('status_enum')) {
            $raw = strtolower($request->get('status_enum'));

            // coba match dengan enum value: registered/testing/reported
            $enum = SampleHighLevelStatus::tryFrom($raw);

            if ($enum) {
                $query->whereIn('current_status', $enum->currentStatuses());
            }
        }

        // Filter by date range: received_at
        if ($request->filled('from')) {
            $query->whereDate('received_at', '>=', $request->get('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('received_at', '<=', $request->get('to'));
        }

        $samples = $query
            ->orderByDesc('received_at')
            ->paginate(15);

        return response()->json([
            'data' => $samples->items(),
            'meta' => [
                'current_page' => $samples->currentPage(),
                'last_page'    => $samples->lastPage(),
                'per_page'     => $samples->perPage(),
                'total'        => $samples->total(),
            ],
        ]);
    }

    /**
     * Register sample baru (dari Formulir Permintaan Pengujian).
     */
    public function store(SampleStoreRequest $request): JsonResponse
    {
        // Data sudah tervalidasi oleh SampleStoreRequest
        $data = $request->validated();

        // Status awal workflow (sesuai CHECK constraint di migration)
        $data['current_status'] = 'received';

    // Traceability: staf yang membuat entri
        /** @var Staff $staff */
        $staff = Auth::user();

        // Safety kecil: kalau entah bagaimana tidak ada staff, stop saja
        if (!$staff instanceof Staff) {
            return response()->json([
                'message' => 'Authenticated staff not found.',
            ], 500);
        }

        $data['created_by'] = $staff->staff_id;

        if (
            array_key_exists('assigned_to', $data)
            && $data['assigned_to'] !== null
            && (int) $data['assigned_to'] !== (int) $staff->staff_id
        ) {
            $this->authorize('overrideAssigneeOnCreate', Sample::class);
        }

        // Auto-assignment: default assigned_to = created_by (kalau belum di-set)
        $data['assigned_to'] = $data['assigned_to'] ?? $staff->staff_id;

        // Simpan sample
        $sample = Sample::create($data);

        // Load relasi untuk response
        $sample->load(['client', 'creator', 'assignee']);

        // 🔎 Audit log: SAMPLE_REGISTERED
        AuditLogger::logSampleRegistered(
            staffId: $staff->staff_id,
            sampleId: $sample->sample_id,
            clientId: $sample->client_id,
            newValues: $sample->toArray(),
        );

        return response()->json([
            'message' => 'Sample registered successfully.',
            'data'    => $sample,
        ], 201);
    }

    /**
     * Detail 1 sample.
     */
    public function show(Sample $sample): JsonResponse
    {
        $sample->load(['client', 'creator', 'assignee']);

        return response()->json([
            'data' => $sample,
        ]);
    }

    /**
     * Update status sample berdasarkan role & workflow transition.
     * POST /api/v1/samples/{sample}/status
     */
    public function updateStatus(SampleStatusUpdateRequest $request, Sample $sample): JsonResponse
    {
        // ✅ Gate: sebelum lab workflow jalan, sample harus sudah physically_received
        // (cuma jalankan kalau kolom request_status memang ada)
        if (Schema::hasColumn('samples', 'request_status')) {
            if (($sample->request_status ?? null) !== 'physically_received') {
                return response()->json([
                    'message' => 'Sample belum diterima fisik oleh lab. Tidak boleh masuk lab workflow.',
                    'errors'  => [
                        'request_status' => [$sample->request_status ?? null],
                    ],
                ], 422);
            }
        }

        /** @var Staff $staff */
        $staff        = Auth::user();
        $targetStatus = $request->input('target_status');
        $note         = $request->input('note');

        if (!$staff instanceof Staff) {
            return response()->json([
                'message' => 'Authenticated staff not found.',
            ], 500);
        }

        // 1) Cegah status yang sama
        if ($sample->current_status === $targetStatus) {
            return response()->json([
                'message' => 'Sample already in the requested status.',
            ], 400);
        }

        // 2) Cek apakah transition diizinkan untuk role & status sekarang
        if (!SampleStatusTransitions::canTransition($staff, $sample, $targetStatus)) {
            return response()->json([
                'message' => 'You are not allowed to perform this status transition.',
            ])->setStatusCode(403);
        }

        $oldStatus = $sample->current_status;

        // 3) Update status
        $sample->current_status = $targetStatus;
        $sample->save();

        // 4) Refresh relasi, status_enum akan ikut berubah otomatis
        $sample->refresh()->load(['client', 'creator']);

        // 🔎 Audit log: SAMPLE_STATUS_CHANGED
        AuditLogger::logSampleStatusChanged(
            staffId: $staff->staff_id,
            sampleId: $sample->sample_id,
            clientId: $sample->client_id,
            oldStatus: $oldStatus,
            newStatus: $targetStatus,
            note: $note,
        );

        return response()->json([
            'message' => 'Sample status updated successfully.',
            'data'    => $sample,
        ]);
    }
}
