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
        if (!Schema::hasTable('sample_requested_parameters')) {
            return;
        }

        if (!method_exists($sample, 'requestedParameters')) {
            return;
        }

        if ($parameterIds === null) {
            return;
        }

        $ids = array_values(array_unique(array_map('intval', $parameterIds)));
        $sample->requestedParameters()->sync($ids);
    }

    private function syncWorkflowGroupFromParameterIds(Sample $sample, ?array $parameterIds, bool $mustResolve = false): void
    {
        if (!Schema::hasColumn('samples', 'workflow_group')) {
            return;
        }

        if ($parameterIds === null) {
            return;
        }

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

        if ($oldGroup === $newGroup) {
            return;
        }

        $sample->workflow_group = $newGroup;
        $sample->save();

        if (!Schema::hasTable('audit_logs')) {
            return;
        }

        $cols = array_flip(Schema::getColumnListing('audit_logs'));
        $payload = [
            'entity_name' => 'samples',
            'entity_id' => $sample->sample_id,
            'action' => 'WORKFLOW_GROUP_RESOLVED_FROM_CLIENT_REQUEST',
            'old_values' => json_encode(['workflow_group' => $oldGroup]),
            'new_values' => json_encode([
                'workflow_group' => $newGroup,
                'parameter_ids' => $ids,
            ]),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (isset($cols['staff_id'])) {
            $payload['staff_id'] = $this->ensureSystemStaffId();
        }

        DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
    }

    public function index(Request $request): JsonResponse
    {
        $client = $this->currentClientOr403();
        $clientId = (int) ($client->client_id ?? $client->getKey());

        $query = Sample::query()
            ->where('client_id', $clientId)
            ->with(['requestedParameters', 'intakeChecklist.checker']);

        if ($request->filled('status') && Schema::hasColumn('samples', 'request_status')) {
            $query->where('request_status', $request->string('status')->toString());
        }

        $dateColumn = Schema::hasColumn('samples', 'submitted_at') ? 'submitted_at' : 'created_at';

        if ($request->filled('from') && Schema::hasColumn('samples', $dateColumn)) {
            $query->whereDate($dateColumn, '>=', $request->get('from'));
        }

        if ($request->filled('to') && Schema::hasColumn('samples', $dateColumn)) {
            $query->whereDate($dateColumn, '<=', $request->get('to'));
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->get('q'));

            if ($q !== '') {
                $driver = DB::connection()->getDriverName();
                $operator = $driver === 'pgsql' ? 'ILIKE' : 'LIKE';
                $like = "%{$q}%";

                $searchableColumns = array_values(array_filter([
                    'sample_type',
                    Schema::hasColumn('samples', 'additional_notes') ? 'additional_notes' : null,
                    Schema::hasColumn('samples', 'request_status') ? 'request_status' : null,
                    Schema::hasColumn('samples', 'lab_sample_code') ? 'lab_sample_code' : null,
                ]));

                $query->where(function ($w) use ($searchableColumns, $operator, $like) {
                    foreach ($searchableColumns as $index => $column) {
                        if ($index === 0) {
                            $w->where($column, $operator, $like);
                        } else {
                            $w->orWhere($column, $operator, $like);
                        }
                    }
                });
            }
        }

        $perPage = (int) $request->get('per_page', 15);
        if ($perPage < 1) {
            $perPage = 15;
        }
        if ($perPage > 200) {
            $perPage = 200;
        }

        $rows = $query->orderByDesc('sample_id')->paginate($perPage);
        $items = $this->attachCoaInfo($rows->items());

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

    public function show(Request $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        $fresh = $sample->fresh(['requestedParameters', 'intakeChecklist.checker']);
        $arr = $this->attachCoaInfo([$fresh]);

        return response()->json([
            'data' => $arr[0],
        ], 200);
    }

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
        $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? null, false);

        $sample->refresh()->load(['requestedParameters', 'intakeChecklist.checker']);

        return response()->json([
            'data' => $sample,
        ], 201);
    }

    public function update(ClientSampleDraftUpdateRequest $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        if (!empty($sample->client_picked_up_at)) {
            return response()->json([
                'message' => 'This request is closed after client pickup and can no longer be edited.',
            ], 409);
        }

        $status = (string) ($sample->request_status ?? 'draft');
        $allowed = ['draft', 'returned', 'needs_revision', 'rejected'];

        if (!in_array($status, $allowed, true)) {
            return response()->json([
                'message' => 'Only draft/returned/rejected requests can be updated.',
            ], 403);
        }

        $data = $request->validated();

        foreach ($data as $key => $value) {
            if ($key === 'parameter_ids') {
                continue;
            }

            if (Schema::hasColumn('samples', $key)) {
                $sample->{$key} = $value;
            }
        }

        $sample->save();

        $this->syncRequestedParameters($sample, $data['parameter_ids'] ?? null);
        $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? null, false);

        $sample->refresh()->load(['requestedParameters', 'intakeChecklist.checker']);

        return response()->json([
            'data' => $sample,
        ], 200);
    }

    public function submit(ClientSampleSubmitRequest $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        if (!empty($sample->client_picked_up_at)) {
            return response()->json([
                'message' => 'This request is closed after client pickup and cannot be submitted again.',
            ], 409);
        }

        $from = (string) ($sample->request_status ?? 'draft');
        $allowedFrom = ['draft', 'returned', 'needs_revision', 'rejected'];

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

            if (in_array($from, ['returned', 'needs_revision', 'rejected'], true)) {
                $this->resetModerationFieldsForResubmit($sample);
            }

            if (Schema::hasColumn('samples', 'request_status')) {
                $sample->request_status = 'submitted';
            }

            if (Schema::hasColumn('samples', 'submitted_at')) {
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
            $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? [], true);

            if (!Schema::hasTable('audit_logs')) {
                return;
            }

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
        });

        $sample->refresh()->load(['requestedParameters', 'intakeChecklist.checker']);

        return response()->json([
            'data' => $sample,
        ], 200);
    }

    public function downloadCoa(Request $request, Sample $sample)
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        if (!Schema::hasTable('reports')) {
            return response()->json(['message' => 'COA is not available yet.'], 404);
        }

        $sampleId = (int) ($sample->sample_id ?? $sample->getKey());

        $q = DB::table('reports')->where('sample_id', $sampleId);

        if (Schema::hasColumn('reports', 'doc_code')) {
            $q->where('doc_code', 'like', 'COA%');
        }

        $q->where('is_locked', true);

        if (Schema::hasColumn('reports', 'coa_released_to_client_at')) {
            $q->whereNotNull('coa_released_to_client_at');
        }

        $report = $q->orderByDesc('generated_at')->orderByDesc('report_id')->first();

        if (!$report) {
            return response()->json(['message' => 'COA is not available yet.'], 404);
        }

        if (Schema::hasColumn('reports', 'pdf_file_id') && !empty($report->pdf_file_id)) {
            $file = DB::table('files')->where('file_id', (int) $report->pdf_file_id)->first();

            if (!$file) {
                return response()->json(['message' => 'COA file not found.'], 404);
            }

            $filename = 'COA_' . preg_replace('/[^A-Za-z0-9_\-]/', '_', (string) ($report->report_no ?? $sampleId)) . '.pdf';
            $headers = [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
                'X-Content-Type-Options' => 'nosniff',
            ];

            if (is_resource($file->bytes)) {
                return response()->streamDownload(
                    function () use ($file) {
                        try {
                            @rewind($file->bytes);
                        } catch (\Throwable $e) {
                        }

                        fpassthru($file->bytes);

                        try {
                            @fclose($file->bytes);
                        } catch (\Throwable $e) {
                        }
                    },
                    $filename,
                    $headers
                );
            }

            return response((string) $file->bytes, 200, $headers);
        }

        $pdfUrl = (string) ($report->pdf_url ?? '');

        if (!$pdfUrl) {
            return response()->json(['message' => 'COA PDF unavailable.'], 404);
        }

        if (preg_match('/^https?:\/\//i', $pdfUrl)) {
            return redirect()->away($pdfUrl);
        }

        $disk = config('filesystems.default') ?: 'public';
        $tryDisks = array_values(array_unique(['public', $disk]));

        foreach ($tryDisks as $d) {
            try {
                if (Storage::disk($d)->exists($pdfUrl)) {
                    $path = Storage::disk($d)->path($pdfUrl);
                    return response()->download($path);
                }
            } catch (\Throwable $e) {
            }
        }

        return response()->json(['message' => 'COA file not found on disk.'], 404);
    }

    private function attachCoaInfo(array $samples): array
    {
        if (!Schema::hasTable('reports')) {
            return $samples;
        }

        $ids = [];

        foreach ($samples as $sample) {
            $sid = (int) ($sample->sample_id ?? $sample->getKey() ?? 0);

            if ($sid > 0) {
                $ids[] = $sid;
            }
        }

        $ids = array_values(array_unique($ids));

        if (empty($ids)) {
            return $samples;
        }

        $q = DB::table('reports')->whereIn('sample_id', $ids);

        if (Schema::hasColumn('reports', 'doc_code')) {
            $q->where('doc_code', 'like', 'COA%');
        }

        $reports = $q->orderByDesc('generated_at')->orderByDesc('report_id')->get();
        $bySample = [];

        foreach ($reports as $report) {
            $sid = (int) ($report->sample_id ?? 0);

            if ($sid > 0 && !isset($bySample[$sid])) {
                $bySample[$sid] = $report;
            }
        }

        foreach ($samples as $sample) {
            $sid = (int) ($sample->sample_id ?? $sample->getKey() ?? 0);
            $report = $bySample[$sid] ?? null;

            $sample->coa_report_id = $report?->report_id ?? null;
            $sample->coa_generated_at = $report?->generated_at ?? null;
            $sample->coa_is_locked = $report ? (bool) ($report->is_locked ?? false) : false;
            $sample->coa_checked_at = Schema::hasColumn('reports', 'coa_checked_at') ? ($report?->coa_checked_at ?? null) : null;
            $sample->coa_released_to_client_at = Schema::hasColumn('reports', 'coa_released_to_client_at') ? ($report?->coa_released_to_client_at ?? null) : null;
            $sample->coa_release_note = Schema::hasColumn('reports', 'coa_release_note') ? ($report?->coa_release_note ?? null) : null;
        }

        return $samples;
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

    private function resetModerationFieldsForResubmit(Sample $sample): void
    {
        $nullableCols = [
            'reviewed_at',
            'ready_at',
            'request_approved_at',
            'request_return_note',
            'request_returned_at',
            'test_method_id',
            'test_method_name',
            'test_method_set_by_staff_id',
            'test_method_set_at',
        ];

        foreach ($nullableCols as $col) {
            if (Schema::hasColumn('samples', $col)) {
                $sample->{$col} = null;
            }
        }
    }
}
