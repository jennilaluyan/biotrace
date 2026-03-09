<?php

namespace App\Services;

use App\Models\Report;
use App\Models\ReportSignature;
use App\Models\ReportSignatureRole;
use App\Models\SampleTest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class ReportGenerationService
{
    private readonly ReportNumberGenerator $numberGenerator;

    public function __construct(?ReportNumberGenerator $numberGenerator = null)
    {
        $this->numberGenerator = $numberGenerator ?? new ReportNumberGenerator('UNSRAT-BML');
    }

    private function sampleStatusColumn(): string
    {
        if (Schema::hasColumn('samples', 'current_status')) {
            return 'current_status';
        }

        if (Schema::hasColumn('samples', 'status')) {
            return 'status';
        }

        return 'current_status';
    }

    private function qcMode(): array
    {
        if (Schema::hasColumn('sample_tests', 'qc_done')) {
            return ['type' => 'bool', 'field' => 'qc_done', 'pass' => true];
        }

        if (Schema::hasColumn('sample_tests', 'qc_summary_status')) {
            return ['type' => 'string', 'field' => 'qc_summary_status', 'pass' => 'pass'];
        }

        if (Schema::hasColumn('sample_tests', 'qc_status')) {
            return ['type' => 'string', 'field' => 'qc_status', 'pass' => 'pass'];
        }

        return ['type' => 'none', 'field' => null, 'pass' => null];
    }

    private function assertCoaEligibleForCreationOrFail(int $sampleId): void
    {
        $statusCol = $this->sampleStatusColumn();

        $sample = DB::table('samples')
            ->select(['sample_id', $statusCol])
            ->where('sample_id', $sampleId)
            ->first();

        if (!$sample) {
            throw new ConflictHttpException('Sample not found.');
        }

        $sampleStatus = (string) ($sample->{$statusCol} ?? '');
        if ($sampleStatus !== 'validated') {
            throw new ConflictHttpException('Sample belum boleh dibuatkan CoA. Status sample harus "validated".');
        }

        $hasNotValidated = SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where('status', '!=', 'validated')
            ->exists();

        if ($hasNotValidated) {
            throw new ConflictHttpException('Semua sample tests harus "validated" sebelum CoA dibuat.');
        }

        $qc = $this->qcMode();
        if ($qc['type'] === 'none') {
            return;
        }

        $qcFailExists = SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where(function ($q) use ($qc) {
                $field = $qc['field'];

                if ($qc['type'] === 'bool') {
                    $q->whereNull($field)->orWhere($field, '!=', true);
                    return;
                }

                $q->whereNull($field)->orWhere($field, '!=', (string) $qc['pass']);
            })
            ->exists();

        if ($qcFailExists) {
            throw new ConflictHttpException('QC harus PASS untuk semua test sebelum CoA dibuat.');
        }
    }

    private function reportItemsSampleTestIdNullable(): bool
    {
        if (!Schema::hasTable('report_items')) {
            return true;
        }

        if (!Schema::hasColumn('report_items', 'sample_test_id')) {
            return true;
        }

        try {
            $driver = DB::getDriverName();

            if ($driver === 'sqlite') {
                $cols = DB::select("PRAGMA table_info('report_items')");
                foreach ($cols as $c) {
                    if ((string) ($c->name ?? '') === 'sample_test_id') {
                        return (int) ($c->notnull ?? 0) === 0;
                    }
                }

                return true;
            }

            if ($driver === 'pgsql') {
                $row = DB::selectOne(
                    "SELECT is_nullable
                     FROM information_schema.columns
                     WHERE table_schema = 'public'
                       AND table_name = 'report_items'
                       AND column_name = 'sample_test_id'
                     LIMIT 1"
                );

                return !$row || strtolower((string) ($row->is_nullable ?? 'yes')) === 'yes';
            }

            if ($driver === 'mysql') {
                $row = DB::selectOne(
                    "SELECT is_nullable
                     FROM information_schema.columns
                     WHERE table_schema = database()
                       AND table_name = 'report_items'
                       AND column_name = 'sample_test_id'
                     LIMIT 1"
                );

                return !$row || strtolower((string) ($row->is_nullable ?? 'yes')) === 'yes';
            }
        } catch (\Throwable $e) {
            return true;
        }

        return true;
    }

    private function fetchLatestValidatedQualityCoverOrFail(int $sampleId): array
    {
        if (!Schema::hasTable('quality_covers')) {
            throw new ConflictHttpException('quality_covers table not found.');
        }

        $qc = DB::table('quality_covers')
            ->where('sample_id', $sampleId)
            ->orderByDesc('quality_cover_id')
            ->first();

        if (!$qc) {
            throw new ConflictHttpException('Cannot generate COA: quality cover not found for this sample.');
        }

        if ((string) ($qc->status ?? '') !== 'validated') {
            throw new ConflictHttpException('Cannot generate COA: quality cover is not validated.');
        }

        $raw = $qc->qc_payload ?? null;
        $payload = null;

        if (is_array($raw)) {
            $payload = $raw;
        } elseif (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            $payload = is_array($decoded) ? $decoded : null;
        } elseif (is_object($raw)) {
            $payload = (array) $raw;
        }

        if (!$payload || !is_array($payload)) {
            throw new ConflictHttpException('Cannot generate COA: qc_payload is empty/invalid.');
        }

        return [
            'workflow_group' => strtolower(trim((string) ($qc->workflow_group ?? ''))),
            'method' => (string) ($qc->method_of_analysis ?? null),
            'date_of_analysis' => $qc->date_of_analysis ?? null,
            'validated_at' => $qc->validated_at ?? null,
            'qc_payload' => $payload,
        ];
    }

    private function resolveCoaSampleIds(int $sampleId): array
    {
        $sample = DB::table('samples')
            ->where('sample_id', $sampleId)
            ->first();

        if (!$sample) {
            throw new RuntimeException('Sample not found.');
        }

        $batchId = isset($sample->request_batch_id) ? (string) $sample->request_batch_id : '';

        if ($batchId === '') {
            return [$sampleId];
        }

        $rows = DB::table('samples')
            ->where('request_batch_id', $batchId)
            ->orderBy('sample_id')
            ->pluck('sample_id')
            ->map(fn($x) => (int) $x)
            ->all();

        return $rows ?: [$sampleId];
    }

    private function resolveRequestBatchId(int $sampleId): ?string
    {
        if (!Schema::hasColumn('samples', 'request_batch_id')) {
            return null;
        }

        $raw = DB::table('samples')
            ->where('sample_id', $sampleId)
            ->value('request_batch_id');

        $value = is_string($raw) ? trim($raw) : '';

        return $value !== '' ? $value : null;
    }

    private function appendQualityCoverFallbackItems(array &$items, int $reportId, int $sampleId, int &$order): void
    {
        if (!$this->reportItemsSampleTestIdNullable()) {
            throw new ConflictHttpException(
                'Cannot generate COA: report_items.sample_test_id is NOT NULL, but sample has no sample_tests. Create tests first.'
            );
        }

        $qc = $this->fetchLatestValidatedQualityCoverOrFail($sampleId);
        $group = (string) ($qc['workflow_group'] ?? '');
        $methodName = $qc['method'] ?? null;
        $testedAt = $qc['date_of_analysis'] ?? $qc['validated_at'] ?? now();
        $payload = (array) $qc['qc_payload'];

        $isPcr = $group !== '' && str_contains($group, 'pcr');
        $isWgs = $group !== '' && str_contains($group, 'wgs');

        if ($isWgs) {
            $lineage = $payload['lineage'] ?? null;
            $variant = $payload['variant'] ?? null;

            if ($lineage !== null) {
                $items[] = [
                    'report_id' => $reportId,
                    'sample_test_id' => null,
                    'parameter_name' => 'Lineage',
                    'method_name' => $methodName,
                    'result_value' => (string) $lineage,
                    'unit_label' => null,
                    'flags' => null,
                    'interpretation' => null,
                    'tested_at' => $testedAt,
                    'order_no' => $order++,
                    'created_at' => now(),
                    'updated_at' => null,
                ];
            }

            if ($variant !== null) {
                $items[] = [
                    'report_id' => $reportId,
                    'sample_test_id' => null,
                    'parameter_name' => 'Variant',
                    'method_name' => $methodName,
                    'result_value' => (string) $variant,
                    'unit_label' => null,
                    'flags' => null,
                    'interpretation' => null,
                    'tested_at' => $testedAt,
                    'order_no' => $order++,
                    'created_at' => now(),
                    'updated_at' => null,
                ];
            }

            if ($lineage === null && $variant === null) {
                throw new ConflictHttpException('Cannot generate COA: WGS qc_payload must include lineage/variant.');
            }

            return;
        }

        if ($isPcr) {
            $targets = ['ORF1b', 'RdRp', 'RPP30'];
            $hasAny = false;

            foreach ($targets as $target) {
                $row = $payload[$target] ?? null;
                if (!is_array($row)) {
                    continue;
                }

                $hasAny = true;

                $value = $row['value'] ?? null;
                $result = $row['result'] ?? null;
                $interpretation = $row['interpretation'] ?? null;

                $items[] = [
                    'report_id' => $reportId,
                    'sample_test_id' => null,
                    'parameter_name' => $target,
                    'method_name' => $methodName,
                    'result_value' => $value !== null ? (string) $value : null,
                    'unit_label' => null,
                    'flags' => null,
                    'interpretation' => trim(implode(' — ', array_filter([
                        $result !== null ? (string) $result : null,
                        $interpretation !== null ? (string) $interpretation : null,
                    ]))) ?: null,
                    'tested_at' => $testedAt,
                    'order_no' => $order++,
                    'created_at' => now(),
                    'updated_at' => null,
                ];
            }

            if (!$hasAny) {
                throw new ConflictHttpException('Cannot generate COA: PCR qc_payload must include ORF1b/RdRp/RPP30.');
            }

            return;
        }

        $notes = $payload['notes'] ?? null;
        if ($notes === null || trim((string) $notes) === '') {
            throw new ConflictHttpException('Cannot generate COA: qc_payload.notes is required for this workflow group.');
        }

        $items[] = [
            'report_id' => $reportId,
            'sample_test_id' => null,
            'parameter_name' => 'Notes',
            'method_name' => $methodName,
            'result_value' => null,
            'unit_label' => null,
            'flags' => null,
            'interpretation' => (string) $notes,
            'tested_at' => $testedAt,
            'order_no' => $order++,
            'created_at' => now(),
            'updated_at' => null,
        ];
    }

    private function buildBatchReportItems(Report $report, array $sampleIds): void
    {
        $unitMap = Schema::hasTable('units')
            ? DB::table('units')->select(['unit_id', 'symbol', 'name'])->get()->keyBy('unit_id')
            : collect();

        $items = [];
        $order = 1;

        foreach ($sampleIds as $sid) {
            $tests = SampleTest::query()
                ->with([
                    'parameter:parameter_id,name',
                    'method:method_id,name',
                    'latestResult' => fn($q) => $q->select('test_results.*'),
                ])
                ->where('sample_id', $sid)
                ->orderBy('sample_test_id')
                ->get();

            if ($tests->isEmpty()) {
                $this->appendQualityCoverFallbackItems($items, $report->report_id, $sid, $order);
                continue;
            }

            $notAllowed = $tests->first(fn($t) => !in_array((string) $t->status, ['validated'], true));
            if ($notAllowed) {
                throw new RuntimeException("Sample {$sid} is not fully validated.");
            }

            foreach ($tests as $t) {
                $resultValue = null;
                $unitLabel = null;
                $flags = null;
                $interpretation = null;

                if ($t->latestResult) {
                    $resultValue = $t->latestResult->value_final !== null
                        ? (string) $t->latestResult->value_final
                        : null;

                    $unitId = $t->latestResult->unit_id ?? null;
                    if ($unitId && isset($unitMap[$unitId])) {
                        $unitLabel = $unitMap[$unitId]->symbol ?: $unitMap[$unitId]->name;
                    }

                    $flags = $t->latestResult->flags ? json_encode($t->latestResult->flags) : null;
                    $interpretation = $t->latestResult->interpretation;
                }

                $items[] = [
                    'report_id' => $report->report_id,
                    'sample_test_id' => $t->sample_test_id,
                    'parameter_name' => $t->parameter?->name ?? 'Unknown Parameter',
                    'method_name' => $t->method?->name,
                    'result_value' => $resultValue,
                    'unit_label' => $unitLabel,
                    'flags' => $flags,
                    'interpretation' => $interpretation,
                    'tested_at' => $t->completed_at,
                    'order_no' => $order++,
                    'created_at' => now(),
                    'updated_at' => null,
                ];
            }
        }

        if (!empty($items)) {
            DB::table('report_items')->insert($items);
        }
    }

    private function createSignatureSlots(int $reportId): void
    {
        $roles = ReportSignatureRole::query()
            ->orderBy('sort_order')
            ->get(['role_code']);

        foreach ($roles as $role) {
            ReportSignature::query()->create([
                'report_id' => $reportId,
                'role_code' => $role->role_code,
                'signed_by' => null,
                'signed_at' => null,
                'signature_hash' => null,
                'note' => null,
                'created_at' => now(),
                'updated_at' => null,
            ]);
        }
    }

    public function generateForSample(int $sampleId, int $actorStaffId): Report
    {
        return DB::transaction(function () use ($sampleId, $actorStaffId) {
            $sampleIds = $this->resolveCoaSampleIds($sampleId);
            $primarySampleId = $sampleIds[0] ?? $sampleId;
            $requestBatchId = $this->resolveRequestBatchId($primarySampleId);
            $canUseBatchLookup = $requestBatchId !== null && Schema::hasColumn('reports', 'request_batch_id');

            $existing = Report::query()
                ->when(
                    $canUseBatchLookup,
                    fn($q) => $q->where('request_batch_id', $requestBatchId),
                    fn($q) => $q->where('sample_id', $primarySampleId)
                )
                ->lockForUpdate()
                ->latest('report_id')
                ->first();

            if ($existing) {
                return $existing;
            }

            foreach ($sampleIds as $sid) {
                $this->assertCoaEligibleForCreationOrFail($sid);
            }

            if (count($sampleIds) > 1 && !Schema::hasTable('report_samples')) {
                throw new ConflictHttpException('Cannot generate batch COA: report_samples table not found.');
            }

            $now = now();
            $reportNo = $this->numberGenerator->next();

            $create = [
                'sample_id' => $primarySampleId,
                'report_no' => $reportNo,
                'generated_at' => $now,
                'generated_by' => $actorStaffId,
                'pdf_url' => 'about:blank',
                'is_locked' => false,
                'created_at' => $now,
                'updated_at' => null,
            ];

            if (Schema::hasColumn('reports', 'primary_sample_id')) {
                $create['primary_sample_id'] = $primarySampleId;
            }

            if (Schema::hasColumn('reports', 'request_batch_id')) {
                $create['request_batch_id'] = $requestBatchId;
            }

            if (Schema::hasColumn('reports', 'batch_total')) {
                $create['batch_total'] = count($sampleIds);
            }

            if (Schema::hasColumn('reports', 'report_type')) {
                $create['report_type'] = 'coa';
            }

            /** @var Report $report */
            $report = Report::query()->create($create);

            if (Schema::hasTable('report_samples')) {
                foreach ($sampleIds as $index => $sid) {
                    DB::table('report_samples')->insert([
                        'report_id' => $report->report_id,
                        'sample_id' => $sid,
                        'batch_item_no' => $index + 1,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            $this->buildBatchReportItems($report, $sampleIds);
            $this->createSignatureSlots($report->report_id);

            return $report;
        }, 3);
    }
}
