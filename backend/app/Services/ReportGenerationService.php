<?php

namespace App\Services;

use App\Models\Report;
use App\Models\ReportSignature;
use App\Models\ReportSignatureRole;
use App\Models\Sample;
use App\Models\SampleTest;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class ReportGenerationService
{
    private readonly ReportNumberGenerator $numberGenerator;

    public function __construct(?ReportNumberGenerator $numberGenerator = null)
    {
        $this->numberGenerator = $numberGenerator ?? new ReportNumberGenerator('UNSRAT-BML');
    }

    /**
     * Generate report for a sample.
     *
     * Rules (MVP):
     * - Sample must exist
     * - All sample_tests must be "validated" (LH) and not cancelled/failed
     * - One report per sample (unique sample_id)
     * - Creates snapshot report_items from SampleTests + latestResult
     * - Creates signature slots based on report_signature_roles (QA_MANAGER, LH)
     *
     * pdf_url: placeholder for now (controller later will update)
     */

    private function sampleStatusColumn(): string
    {
        if (Schema::hasColumn('samples', 'current_status')) return 'current_status';
        if (Schema::hasColumn('samples', 'status')) return 'status';
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

        $sample = \App\Models\Sample::query()
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

        // semua sample_tests harus validated (kalau ada)
        $hasNotValidated = \App\Models\SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where('status', '!=', 'validated')
            ->exists();

        if ($hasNotValidated) {
            throw new ConflictHttpException('Semua sample tests harus "validated" sebelum CoA dibuat.');
        }

        // QC PASS semua (kalau table punya field QC)
        $qc = $this->qcMode();
        if ($qc['type'] !== 'none') {
            $qcFailExists = \App\Models\SampleTest::query()
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
    }

    private function reportItemsSampleTestIdNullable(): bool
    {
        if (!Schema::hasTable('report_items')) return true;
        if (!Schema::hasColumn('report_items', 'sample_test_id')) return true;

        try {
            $driver = DB::getDriverName();

            if ($driver === 'sqlite') {
                $cols = DB::select("PRAGMA table_info('report_items')");
                foreach ($cols as $c) {
                    if ((string) ($c->name ?? '') === 'sample_test_id') {
                        // notnull: 1 = NOT NULL, 0 = nullable
                        return (int) ($c->notnull ?? 0) === 0;
                    }
                }
                return true; // fail-open if column not found
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
            // fail-open
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

    private function buildReportItemsFromQualityCover(int $sampleId, Report $report): void
    {
        $qc = $this->fetchLatestValidatedQualityCoverOrFail($sampleId);

        $group = (string) ($qc['workflow_group'] ?? '');
        $methodName = $qc['method'] ?? null;

        $testedAt = $qc['date_of_analysis'] ?? $qc['validated_at'] ?? now();
        $payload = (array) $qc['qc_payload'];

        $isPcr = $group !== '' && str_contains($group, 'pcr');
        $isWgs = $group !== '' && str_contains($group, 'wgs');

        $items = [];
        $order = 1;

        $sampleTestIdNullable = $this->reportItemsSampleTestIdNullable();

        if (!$sampleTestIdNullable) {
            throw new ConflictHttpException(
                'Cannot generate COA: report_items.sample_test_id is NOT NULL, but sample has no sample_tests. Create tests first.'
            );
        }

        if ($isWgs) {
            $lineage = $payload['lineage'] ?? null;
            $variant = $payload['variant'] ?? null;

            if ($lineage !== null) {
                $items[] = [
                    'report_id' => $report->report_id,
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
                    'report_id' => $report->report_id,
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

            if (empty($items)) {
                throw new ConflictHttpException('Cannot generate COA: WGS qc_payload must include lineage/variant.');
            }
        } elseif ($isPcr) {
            $targets = ['ORF1b', 'RdRp', 'RPP30'];

            foreach ($targets as $t) {
                $x = $payload[$t] ?? null;
                if (!is_array($x)) continue;

                $value = $x['value'] ?? null;
                $result = $x['result'] ?? null;
                $interp = $x['interpretation'] ?? null;

                $items[] = [
                    'report_id' => $report->report_id,
                    'sample_test_id' => null,
                    'parameter_name' => $t,
                    'method_name' => $methodName,
                    'result_value' => $value !== null ? (string) $value : null,
                    'unit_label' => null,
                    'flags' => null,
                    'interpretation' => trim(implode(' — ', array_filter([
                        $result !== null ? (string) $result : null,
                        $interp !== null ? (string) $interp : null,
                    ]))) ?: null,
                    'tested_at' => $testedAt,
                    'order_no' => $order++,
                    'created_at' => now(),
                    'updated_at' => null,
                ];
            }

            if (empty($items)) {
                throw new ConflictHttpException('Cannot generate COA: PCR qc_payload must include ORF1b/RdRp/RPP30.');
            }
        } else {
            $notes = $payload['notes'] ?? null;

            if ($notes === null || trim((string) $notes) === '') {
                throw new ConflictHttpException('Cannot generate COA: qc_payload.notes is required for this workflow group.');
            }

            $items[] = [
                'report_id' => $report->report_id,
                'sample_test_id' => null,
                'parameter_name' => 'Notes',
                'method_name' => $methodName,
                'result_value' => null,
                'unit_label' => null,
                'flags' => null,
                'interpretation' => (string) $notes,
                'tested_at' => $testedAt,
                'order_no' => 1,
                'created_at' => now(),
                'updated_at' => null,
            ];
        }

        DB::table('report_items')->insert($items);
    }

    public function generateForSample(int $sampleId, int $actorStaffId): Report
    {
        return DB::transaction(function () use ($sampleId, $actorStaffId) {
            /** @var Sample|null $sample */
            $sample = Sample::query()->where('sample_id', $sampleId)->first();
            if (!$sample) {
                throw new RuntimeException('Sample not found.');
            }

            // ✅ lock existing report check (avoid double-create race)
            $existing = \App\Models\Report::query()
                ->where('sample_id', $sampleId)
                ->lockForUpdate()
                ->latest('report_id')
                ->first();

            if ($existing) {
                return $existing;
            }

            // Enforce eligibility untuk create
            $this->assertCoaEligibleForCreationOrFail($sampleId);

            // Validate tests states (keep query minimal)
            $tests = SampleTest::query()
                ->where('sample_id', $sampleId)
                ->select([
                    'sample_test_id',
                    'parameter_id',
                    'method_id',
                    'status',
                    'completed_at',
                ])
                ->orderBy('sample_test_id')
                ->get();

            $reportNo = $this->numberGenerator->next();

            $create = [
                'sample_id' => $sampleId,
                'report_no' => $reportNo,
                'generated_at' => now(),
                'generated_by' => $actorStaffId,
                'pdf_url' => 'about:blank', // placeholder
                'is_locked' => false,
                'created_at' => now(),
                'updated_at' => null,
            ];

            if (Schema::hasColumn('reports', 'report_type')) {
                $create['report_type'] = 'coa';
            }

            /** @var Report $report */
            $report = Report::query()->create($create);

            // ✅ CASE 1: tidak ada tests → fallback dari Quality Cover (qc_payload)
            if ($tests->isEmpty()) {
                $this->buildReportItemsFromQualityCover($sampleId, $report);

                $roles = ReportSignatureRole::query()
                    ->orderBy('sort_order')
                    ->get(['role_code']);

                foreach ($roles as $role) {
                    ReportSignature::query()->create([
                        'report_id' => $report->report_id,
                        'role_code' => $role->role_code,
                        'signed_by' => null,
                        'signed_at' => null,
                        'signature_hash' => null,
                        'note' => null,
                        'created_at' => now(),
                        'updated_at' => null,
                    ]);
                }

                return $report;
            }

            // ✅ CASE 2: ada tests → behavior lama
            $notAllowed = $tests->first(fn($t) => !in_array($t->status, ['validated'], true));
            if ($notAllowed) {
                throw new ConflictHttpException('Cannot generate report: all tests must be validated.');
            }

            $testIds = $tests->pluck('sample_test_id')->all();

            $testsFull = SampleTest::query()
                ->with([
                    'parameter:parameter_id,name',
                    'method:method_id,name',
                    'latestResult' => function ($q) {
                        $q->select('test_results.*');
                    },
                    'latestResult.creator:staff_id,name',
                ])
                ->whereIn('sample_test_id', $testIds)
                ->orderBy('sample_test_id')
                ->get();

            $unitMap = DB::table('units')->select(['unit_id', 'symbol', 'name'])->get()
                ->keyBy('unit_id');

            $items = [];
            $order = 1;

            foreach ($testsFull as $t) {
                $paramName = $t->parameter?->name ?? 'Unknown Parameter';
                $methodName = $t->method?->name;

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

                    $flags = $t->latestResult->flags ?? null;
                    $interpretation = $t->latestResult->interpretation ?? null;
                }

                $items[] = [
                    'report_id' => $report->report_id,
                    'sample_test_id' => $t->sample_test_id,
                    'parameter_name' => $paramName,
                    'method_name' => $methodName,
                    'result_value' => $resultValue,
                    'unit_label' => $unitLabel,
                    'flags' => $flags ? json_encode($flags) : null,
                    'interpretation' => $interpretation,
                    'tested_at' => $t->completed_at,
                    'order_no' => $order++,
                    'created_at' => now(),
                    'updated_at' => null,
                ];
            }

            DB::table('report_items')->insert($items);

            $roles = ReportSignatureRole::query()
                ->orderBy('sort_order')
                ->get(['role_code']);

            foreach ($roles as $role) {
                ReportSignature::query()->create([
                    'report_id' => $report->report_id,
                    'role_code' => $role->role_code,
                    'signed_by' => null,
                    'signed_at' => null,
                    'signature_hash' => null,
                    'note' => null,
                    'created_at' => now(),
                    'updated_at' => null,
                ]);
            }

            return $report;
        }, 3);
    }
}
