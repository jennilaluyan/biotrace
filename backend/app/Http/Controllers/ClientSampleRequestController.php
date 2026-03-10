<?php

namespace App\Http\Controllers;

use App\Http\Requests\ClientSampleDraftStoreRequest;
use App\Http\Requests\ClientSampleDraftUpdateRequest;
use App\Http\Requests\ClientSampleSubmitRequest;
use App\Models\Client;
use App\Models\Sample;
use App\Services\WorkflowGroupResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

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

    private function normalizeRequestedQuantity(Client $client, Request $request, array $data): int
    {
        $clientType = strtolower(trim((string) ($client->type ?? 'individual')));

        if ($clientType !== 'institution') {
            return 1;
        }

        $rawQuantity =
            $data['quantity']
            ?? $data['total_sample']
            ?? $request->input('quantity')
            ?? $request->input('total_sample')
            ?? 1;

        $quantity = (int) $rawQuantity;

        return max(1, min($quantity, 200));
    }

    /**
     * @return Builder<Sample>
     */
    private function batchScopeForOwnedSample(Client $client, Sample $sample): Builder
    {
        $clientId = (int) ($client->client_id ?? $client->getKey());
        $batchId = Schema::hasColumn('samples', 'request_batch_id')
            ? trim((string) ($sample->request_batch_id ?? ''))
            : '';

        $query = Sample::query()->where('client_id', $clientId);

        if ($batchId !== '') {
            return $query->where('request_batch_id', $batchId);
        }

        return $query->whereKey($sample->getKey());
    }

    private function assertEditableClientRequestStatus(Sample $sample): void
    {
        if (!empty($sample->client_picked_up_at)) {
            abort(409, 'This request is closed after client pickup and can no longer be edited.');
        }

        $status = (string) ($sample->request_status ?? 'draft');

        if (!in_array($status, ['draft', 'returned', 'needs_revision', 'rejected'], true)) {
            abort(403, 'Only draft/returned/rejected requests can be updated.');
        }
    }

    private function fillClientDraftFields(Sample $sample, array $data, int $systemStaffId): void
    {
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

        if (Schema::hasColumn('samples', 'created_by') && empty($sample->created_by)) {
            $sample->created_by = $systemStaffId;
        }

        if (Schema::hasColumn('samples', 'assigned_to') && empty($sample->assigned_to)) {
            $sample->assigned_to = $systemStaffId;
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

    /**
     * @return Collection<int, Sample>
     */
    private function syncBatchRowsForEditableRequest(
        Client $client,
        Sample $sample,
        Request $request,
        array $data,
        int $systemStaffId
    ): Collection {
        $clientId = (int) ($client->client_id ?? $client->getKey());
        $desiredQuantity = $this->normalizeRequestedQuantity($client, $request, $data);

        /** @var Collection<int, Sample> $targets */
        $targets = $this->batchScopeForOwnedSample($client, $sample)
            ->lockForUpdate()
            ->orderBy('request_batch_item_no')
            ->orderBy('sample_id')
            ->get();

        if ($targets->isEmpty()) {
            abort(404, 'Request not found.');
        }

        foreach ($targets as $target) {
            $this->assertEditableClientRequestStatus($target);
        }

        /** @var Sample|null $primary */
        $primary = $targets
            ->sortBy(fn(Sample $row) => (int) ($row->request_batch_item_no ?? 1))
            ->first();

        if (!$primary instanceof Sample) {
            abort(404, 'Request not found.');
        }

        $hasBatchId = Schema::hasColumn('samples', 'request_batch_id');
        $hasBatchTotal = Schema::hasColumn('samples', 'request_batch_total');
        $hasBatchItemNo = Schema::hasColumn('samples', 'request_batch_item_no');
        $hasBatchPrimary = Schema::hasColumn('samples', 'is_batch_primary');
        $hasBatchExcludedAt = Schema::hasColumn('samples', 'batch_excluded_at');
        $hasBatchExclusionReason = Schema::hasColumn('samples', 'batch_exclusion_reason');

        $batchId = ($desiredQuantity > 1 && $hasBatchId)
            ? (trim((string) ($primary->request_batch_id ?? '')) ?: (string) Str::uuid())
            : null;

        /** @var Collection<int, Sample> $ordered */
        $ordered = $targets
            ->sortBy(fn(Sample $row) => (int) ($row->request_batch_item_no ?? 1))
            ->values();

        /** @var Collection<int, Sample> $keepers */
        $keepers = $ordered->take($desiredQuantity)->values();

        /** @var Collection<int, Sample> $extras */
        $extras = $ordered->slice($desiredQuantity)->values();

        foreach ($extras as $extra) {
            if (Schema::hasTable('sample_requested_parameters') && method_exists($extra, 'requestedParameters')) {
                $extra->requestedParameters()->detach();
            }

            $extra->delete();
        }

        $keepIds = $keepers
            ->pluck('sample_id')
            ->map(fn($id) => (int) $id)
            ->values()
            ->all();

        if ($ordered->count() < $desiredQuantity) {
            $baseStatus = (string) ($primary->request_status ?? 'draft');

            for ($i = $ordered->count() + 1; $i <= $desiredQuantity; $i++) {
                $new = new Sample();
                $new->client_id = $clientId;

                if (Schema::hasColumn('samples', 'request_status')) {
                    $new->request_status = $baseStatus;
                }

                if ($hasBatchId) {
                    $new->request_batch_id = $batchId;
                }

                if ($hasBatchTotal) {
                    $new->request_batch_total = $desiredQuantity;
                }

                if ($hasBatchItemNo) {
                    $new->request_batch_item_no = $i;
                }

                if ($hasBatchPrimary) {
                    $new->is_batch_primary = false;
                }

                $this->fillClientDraftFields($new, $data, $systemStaffId);
                $new->save();

                $keepIds[] = (int) $new->sample_id;
            }
        }

        /** @var Collection<int, Sample> $reloaded */
        $reloaded = Sample::query()
            ->whereIn('sample_id', $keepIds)
            ->orderBy('request_batch_item_no')
            ->orderBy('sample_id')
            ->get()
            ->values();

        foreach ($reloaded as $index => $target) {
            if ($hasBatchId) {
                $target->request_batch_id = $desiredQuantity > 1 ? $batchId : null;
            }

            if ($hasBatchTotal) {
                $target->request_batch_total = $desiredQuantity;
            }

            if ($hasBatchItemNo) {
                $target->request_batch_item_no = $index + 1;
            }

            if ($hasBatchPrimary) {
                $target->is_batch_primary = $index === 0;
            }

            if ($hasBatchExcludedAt) {
                $target->batch_excluded_at = null;
            }

            if ($hasBatchExclusionReason) {
                $target->batch_exclusion_reason = null;
            }

            $target->save();
        }

        return $reloaded;
    }

    private function attachBatchContext(Sample $sample, bool $includeBatchItems = true): array
    {
        $sample->loadMissing(['requestedParameters', 'intakeChecklist.checker']);

        $requestBatchId = Schema::hasColumn('samples', 'request_batch_id')
            ? trim((string) ($sample->request_batch_id ?? ''))
            : '';

        $requestBatchTotal = Schema::hasColumn('samples', 'request_batch_total')
            ? (int) ($sample->request_batch_total ?? 0)
            : 0;

        /** @var Collection<int, Sample> $batchItems */
        $batchItems = collect();

        if ($requestBatchId !== '') {
            $batchItems = Sample::query()
                ->with(['requestedParameters', 'intakeChecklist.checker'])
                ->where('client_id', $sample->client_id)
                ->where('request_batch_id', $requestBatchId)
                ->orderBy('request_batch_item_no')
                ->orderBy('sample_id')
                ->get();
        } elseif ($requestBatchTotal > 1) {
            $batchItems = collect([$sample]);
        }

        /** @var Collection<int, Sample> $activeItems */
        $activeItems = $batchItems->isNotEmpty()
            ? (
                Schema::hasColumn('samples', 'batch_excluded_at')
                ? $batchItems->filter(fn(Sample $row) => empty($row->batch_excluded_at))
                : $batchItems
            )
            : collect();

        $batchTotal = $requestBatchTotal > 0
            ? $requestBatchTotal
            : max(1, $batchItems->count());

        $batchActiveTotal = $requestBatchId !== ''
            ? $activeItems->count()
            : $batchTotal;

        $batchExcludedTotal = $requestBatchId !== ''
            ? max(0, $batchItems->count() - $activeItems->count())
            : 0;

        return [
            ...$sample->toArray(),
            'batch_items' => $includeBatchItems ? $batchItems->values()->all() : [],
            'batch_summary' => [
                'request_batch_id' => $requestBatchId !== '' ? $requestBatchId : null,
                'batch_total' => $batchTotal,
                'batch_active_total' => $batchActiveTotal,
                'batch_excluded_total' => $batchExcludedTotal,
                'sample_ids' => $batchItems->isNotEmpty()
                    ? $batchItems->pluck('sample_id')->map(fn($id) => (int) $id)->values()->all()
                    : [(int) $sample->sample_id],
            ],
        ];
    }

    /**
     * @param array<int, int> $ids
     * @return Collection<int, Sample>
     */
    private function loadSamplesByIds(array $ids): Collection
    {
        return Sample::query()
            ->whereIn('sample_id', $ids)
            ->with(['requestedParameters', 'intakeChecklist.checker'])
            ->get();
    }

    /**
     * @param Collection<int, Sample> $samples
     */
    private function primarySampleFromCollection(Collection $samples): ?Sample
    {
        $primary = $samples
            ->sortBy(fn(Sample $row) => (int) ($row->request_batch_item_no ?? 1))
            ->first();

        return $primary instanceof Sample ? $primary : null;
    }

    private function preparePrimaryResponseSample(?Sample $sample): ?Sample
    {
        if (!$sample instanceof Sample) {
            return null;
        }

        $items = $this->attachCoaInfo([$sample]);

        return $items[0] instanceof Sample ? $items[0] : null;
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

        if (!$fresh instanceof Sample) {
            $fresh = $sample->load(['requestedParameters', 'intakeChecklist.checker']);
        }

        $responseSample = $this->preparePrimaryResponseSample($fresh);

        return response()->json([
            'data' => $responseSample ? $this->attachBatchContext($responseSample, true) : null,
        ], 200);
    }

    public function store(ClientSampleDraftStoreRequest $request): JsonResponse
    {
        $client = $this->currentClientOr403();
        $clientId = (int) ($client->client_id ?? $client->getKey());
        $data = $request->validated();
        $quantity = $this->normalizeRequestedQuantity($client, $request, $data);
        $systemStaffId = $this->ensureSystemStaffId();

        $batchId = Schema::hasColumn('samples', 'request_batch_id') && $quantity > 1
            ? (string) Str::uuid()
            : null;

        $createdIds = DB::transaction(function () use ($clientId, $data, $quantity, $systemStaffId, $batchId) {
            $ids = [];

            for ($i = 1; $i <= $quantity; $i++) {
                $sample = new Sample();
                $sample->client_id = $clientId;

                if (Schema::hasColumn('samples', 'request_status')) {
                    $sample->request_status = 'draft';
                }

                if (Schema::hasColumn('samples', 'request_batch_id')) {
                    $sample->request_batch_id = $batchId;
                }

                if (Schema::hasColumn('samples', 'request_batch_total')) {
                    $sample->request_batch_total = $quantity;
                }

                if (Schema::hasColumn('samples', 'request_batch_item_no')) {
                    $sample->request_batch_item_no = $i;
                }

                if (Schema::hasColumn('samples', 'is_batch_primary')) {
                    $sample->is_batch_primary = $i === 1;
                }

                $this->fillClientDraftFields($sample, $data, $systemStaffId);
                $sample->save();

                $this->syncRequestedParameters($sample, $data['parameter_ids'] ?? null);
                $this->syncWorkflowGroupFromParameterIds($sample, $data['parameter_ids'] ?? null, false);

                $ids[] = (int) $sample->sample_id;
            }

            return $ids;
        });

        $samples = $this->loadSamplesByIds($createdIds);
        $primary = $this->preparePrimaryResponseSample($this->primarySampleFromCollection($samples));

        return response()->json([
            'data' => $primary ? $this->attachBatchContext($primary, true) : null,
            'meta' => [
                'request_batch_id' => $primary?->request_batch_id,
                'batch_total' => count($createdIds),
                'affected_sample_ids' => $createdIds,
            ],
        ], 201);
    }

    public function update(ClientSampleDraftUpdateRequest $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        $data = $request->validated();
        $systemStaffId = $this->ensureSystemStaffId();

        $updatedIds = DB::transaction(function () use ($client, $sample, $request, $data, $systemStaffId) {
            $targets = $this->syncBatchRowsForEditableRequest($client, $sample, $request, $data, $systemStaffId);

            foreach ($targets as $target) {
                foreach ($data as $key => $value) {
                    if (in_array($key, ['parameter_ids', 'quantity', 'total_sample'], true)) {
                        continue;
                    }

                    if (Schema::hasColumn('samples', $key)) {
                        $target->{$key} = $value;
                    }
                }

                $this->fillClientDraftFields($target, $data, $systemStaffId);
                $target->save();

                $this->syncRequestedParameters($target, $data['parameter_ids'] ?? null);
                $this->syncWorkflowGroupFromParameterIds($target, $data['parameter_ids'] ?? null, false);
            }

            return $targets->pluck('sample_id')->map(fn($id) => (int) $id)->values()->all();
        });

        $samples = $this->loadSamplesByIds($updatedIds);
        $primary = $this->preparePrimaryResponseSample($this->primarySampleFromCollection($samples));

        return response()->json([
            'data' => $primary ? $this->attachBatchContext($primary, true) : null,
            'meta' => [
                'request_batch_id' => $primary?->request_batch_id,
                'batch_total' => count($updatedIds),
                'affected_sample_ids' => $updatedIds,
            ],
        ], 200);
    }

    public function submit(ClientSampleSubmitRequest $request, Sample $sample): JsonResponse
    {
        $client = $this->currentClientOr403();
        $this->assertOwnedByClient($client, $sample);

        $data = $request->validated();
        $systemStaffId = $this->ensureSystemStaffId();

        $submittedIds = DB::transaction(function () use ($client, $sample, $request, $data, $systemStaffId) {
            $targets = $this->syncBatchRowsForEditableRequest($client, $sample, $request, $data, $systemStaffId);

            $affectedIds = [];

            foreach ($targets as $target) {
                $from = (string) ($target->request_status ?? 'draft');

                $this->fillClientDraftFields($target, $data, $systemStaffId);

                if (in_array($from, ['returned', 'needs_revision', 'rejected'], true)) {
                    $this->resetModerationFieldsForResubmit($target);
                }

                if (Schema::hasColumn('samples', 'request_status')) {
                    $target->request_status = 'submitted';
                }

                if (Schema::hasColumn('samples', 'submitted_at')) {
                    $target->submitted_at = now();
                }

                $target->save();

                $this->syncRequestedParameters($target, $data['parameter_ids'] ?? []);
                $this->syncWorkflowGroupFromParameterIds($target, $data['parameter_ids'] ?? [], true);

                $affectedIds[] = (int) $target->sample_id;
            }

            if (Schema::hasTable('audit_logs') && count($affectedIds) > 0) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));
                $payload = [
                    'entity_name' => 'samples',
                    'entity_id' => $affectedIds[0],
                    'action' => 'CLIENT_SAMPLE_REQUEST_SUBMITTED',
                    'old_values' => json_encode(['batch_count' => count($affectedIds)]),
                    'new_values' => json_encode([
                        'request_status' => 'submitted',
                        'affected_sample_ids' => $affectedIds,
                    ]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];

                if (isset($cols['staff_id'])) {
                    $payload['staff_id'] = $this->ensureSystemStaffId();
                }

                DB::table('audit_logs')->insert(array_intersect_key($payload, $cols));
            }

            return $affectedIds;
        });

        $samples = $this->loadSamplesByIds($submittedIds);
        $primary = $this->preparePrimaryResponseSample($this->primarySampleFromCollection($samples));

        return response()->json([
            'data' => $primary ? $this->attachBatchContext($primary, true) : null,
            'meta' => [
                'request_batch_id' => $primary?->request_batch_id,
                'batch_total' => count($submittedIds),
                'affected_sample_ids' => $submittedIds,
            ],
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
                        } catch (\Throwable) {
                        }

                        fpassthru($file->bytes);

                        try {
                            @fclose($file->bytes);
                        } catch (\Throwable) {
                        }
                    },
                    $filename,
                    $headers
                );
            }

            return response((string) $file->bytes, 200, $headers);
        }

        $pdfUrl = (string) ($report->pdf_url ?? '');

        if ($pdfUrl === '') {
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
            } catch (\Throwable) {
            }
        }

        return response()->json(['message' => 'COA file not found on disk.'], 404);
    }

    /**
     * @param array<int, Sample> $samples
     * @return array<int, Sample>
     */
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

        if ($ids === []) {
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
                } catch (\Throwable) {
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
