<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClientSampleDraftStoreRequest;
use App\Http\Requests\ClientSampleDraftUpdateRequest;
use App\Http\Requests\ClientSampleSubmitRequest;
use App\Models\Client;
use App\Models\Sample;
use App\Services\WorkflowGroupResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ClientSampleRequestController extends Controller
{
    public function __construct(
        private readonly WorkflowGroupResolver $workflowGroupResolver
    ) {}

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
     * ✅ Resolve + persist workflow_group on samples table (schema-safe).
     * - For draft: best-effort (if cannot resolve, keep null)
     * - For submit: caller may enforce must-resolve
     */
    private function syncWorkflowGroupFromParameterIds(Sample $sample, ?array $parameterIds, bool $mustResolve = false): void
    {
        if (!Schema::hasColumn('samples', 'workflow_group')) return;
        if ($parameterIds === null) return;

        $ids = array_values(array_unique(array_map('intval', $parameterIds)));
        if (count($ids) === 0) {
            if ($mustResolve) {
                abort(422, 'Cannot resolve workflow group: parameter_ids is empty.');
            }
            return;
        }

        $resolved = $this->workflowGroupResolver->resolveFromParameterIds($ids);
        $newGroup = $resolved?->value ?? null;

        if (!$newGroup) {
            if ($mustResolve) {
                abort(422, 'Cannot resolve workflow group from parameter_ids.');
            }
            return;
        }

        $oldGroup = $sample->workflow_group ?? null;
        if ($oldGroup === $newGroup) return;

        $sample->workflow_group = $newGroup;
        $sample->save();

        // optional audit (schema-safe)
        if (Schema::hasTable('audit_logs')) {
            $cols = array_flip(Schema::getColumnListing('audit_logs'));

            $payload = [
                'entity_name' => 'samples',
                'entity_id' => $sample->sample_id,
                'action' => 'WORKFLOW_GROUP_RESOLVED_FROM_CLIENT_REQUEST',
                'old_values' => json_encode(['workflow_group' => $oldGroup]),
                'new_values' => json_encode(['workflow_group' => $newGroup, 'parameter_ids' => $ids]),
                'created_at' => now(),
                'updated_at' => now(),
            ];

            // keep it consistent with your "system staff" pattern
            if (isset($cols['staff_id'])) {
                $payload['staff_id'] = $this->ensureSystemStaffId();
            }

            DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
        }
    }

    /**
     * GET /api/v1/client/samples
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

        // ✅ Attach COA info for client tracking (no extra endpoint needed)
        $items = $rows->items();
        $items = $this->attachCoaInfo($items);

        return response()->json([
            'data' => $items,
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

        $sample->load(['requestedParameters']);

        $fresh = $sample->fresh()->load(['requestedParameters']);
        $arr = $this->attachCoaInfo([$fresh]);

        return response()->json([
            'data' => $arr[0],
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

        // ✅ NEW: best-effort resolve group on draft (do not hard fail)
        $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? null, false);

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

        // ✅ NEW: best-effort resolve group when parameters changed
        $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? null, false);

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

            // ✅ NEW: submit must have resolvable workflow_group
            $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? [], true);

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

    /**
     * GET /api/v1/client/samples/{sample}/coa
     * Client can download COA only AFTER admin releases it.
     */
    public function downloadCoa(Request $request, Sample $sample)
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        $sampleId = (int) ($sample->sample_id ?? $sample->getKey());

        // Find latest COA-ish report for this sample
        $q = DB::table('reports')->where('sample_id', $sampleId);

        // Prefer doc_code filter if exists
        if (Schema::hasColumn('reports', 'doc_code')) {
            $q->where('doc_code', 'like', 'COA%');
        }

        // Must be locked/final
        $q->where('is_locked', true);

        // Must be released by admin (if fields exist)
        if (Schema::hasColumn('reports', 'coa_released_to_client_at')) {
            $q->whereNotNull('coa_released_to_client_at');
        }

        $report = $q->orderByDesc('generated_at')->orderByDesc('report_id')->first();

        if (!$report) {
            return response()->json(['message' => 'COA is not available yet.'], 404);
        }

        // Prefer files table via pdf_file_id if present
        if (Schema::hasColumn('reports', 'pdf_file_id') && !empty($report->pdf_file_id)) {
            $file = DB::table('files')->where('file_id', (int) $report->pdf_file_id)->first();
            if (!$file) return response()->json(['message' => 'COA file not found.'], 404);

            $filename = 'COA_' . preg_replace('/[^A-Za-z0-9_\-]/', '_', (string) ($report->report_no ?? $sampleId)) . '.pdf';

            return response($file->bytes, 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
            ]);
        }

        // Fallback: pdf_url from storage/public
        $pdfUrl = (string) ($report->pdf_url ?? '');
        if (!$pdfUrl) return response()->json(['message' => 'COA PDF unavailable.'], 404);

        // If already absolute URL, redirect (still gated because endpoint is gated)
        if (preg_match('/^https?:\/\//i', $pdfUrl)) {
            return redirect()->away($pdfUrl);
        }

        // Relative -> disk public
        $disk = config('filesystems.default') ?: 'public';
        $tryDisks = array_values(array_unique(['public', $disk]));

        foreach ($tryDisks as $d) {
            try {
                if (Storage::disk($d)->exists($pdfUrl)) {
                    return Storage::disk($d)->download($pdfUrl);
                }
            } catch (\Throwable $e) {
                // keep trying
            }
        }

        return response()->json(['message' => 'COA file not found on disk.'], 404);
    }

    /**
     * Attach COA tracking fields onto sample payload(s) for portal UI.
     *
     * Adds:
     * - coa_report_id
     * - coa_generated_at
     * - coa_is_locked
     * - coa_checked_at
     * - coa_released_to_client_at
     * - coa_release_note
     */
    private function attachCoaInfo(array $samples): array
    {
        $ids = [];
        foreach ($samples as $s) {
            $sid = (int) ($s->sample_id ?? $s->getKey() ?? 0);
            if ($sid > 0) $ids[] = $sid;
        }
        $ids = array_values(array_unique($ids));
        if (empty($ids)) return $samples;

        $q = DB::table('reports')->whereIn('sample_id', $ids);

        if (Schema::hasColumn('reports', 'doc_code')) {
            $q->where('doc_code', 'like', 'COA%');
        }

        $reports = $q->orderByDesc('generated_at')->orderByDesc('report_id')->get();

        $bySample = [];
        foreach ($reports as $r) {
            $sid = (int) ($r->sample_id ?? 0);
            if ($sid > 0 && !isset($bySample[$sid])) {
                $bySample[$sid] = $r; // first = latest because order desc
            }
        }

        foreach ($samples as $s) {
            $sid = (int) ($s->sample_id ?? $s->getKey() ?? 0);
            $r = $bySample[$sid] ?? null;

            $s->coa_report_id = $r?->report_id ?? null;
            $s->coa_generated_at = $r?->generated_at ?? null;
            $s->coa_is_locked = $r ? (bool) ($r->is_locked ?? false) : false;

            $s->coa_checked_at = Schema::hasColumn('reports', 'coa_checked_at') ? ($r?->coa_checked_at ?? null) : null;
            $s->coa_released_to_client_at = Schema::hasColumn('reports', 'coa_released_to_client_at') ? ($r?->coa_released_to_client_at ?? null) : null;
            $s->coa_release_note = Schema::hasColumn('reports', 'coa_release_note') ? ($r?->coa_release_note ?? null) : null;
        }

        return $samples;
    }

    // ... ensureSystemStaffId() as-is (unchanged)
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
