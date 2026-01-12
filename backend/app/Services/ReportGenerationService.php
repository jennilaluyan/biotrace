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
    public function __construct(
        private readonly ReportNumberGenerator $numberGenerator = new ReportNumberGenerator('UNSRAT-BML')
    ) {}

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
        // supaya tidak asumsi nama kolom
        if (Schema::hasColumn('samples', 'current_status')) return 'current_status';
        if (Schema::hasColumn('samples', 'status')) return 'status';
        return 'current_status'; // fallback (kalau schema check gagal)
    }

    private function qcMode(): array
    {
        // cek kolom QC mana yang ada, urut prioritas
        if (Schema::hasColumn('sample_tests', 'qc_done')) {
            return ['type' => 'bool', 'field' => 'qc_done', 'pass' => true];
        }

        if (Schema::hasColumn('sample_tests', 'qc_summary_status')) {
            // biasanya: pass / warning / fail → kita butuh PASS semua
            return ['type' => 'string', 'field' => 'qc_summary_status', 'pass' => 'pass'];
        }

        if (Schema::hasColumn('sample_tests', 'qc_status')) {
            return ['type' => 'string', 'field' => 'qc_status', 'pass' => 'pass'];
        }

        // jika belum ada kolom QC sama sekali, kita fail-safe: jangan allow create CoA
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

        // semua sample_tests harus validated
        $hasNotValidated = \App\Models\SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where('status', '!=', 'validated')
            ->exists();

        if ($hasNotValidated) {
            throw new ConflictHttpException('Semua sample tests harus "validated" sebelum CoA dibuat.');
        }

        // QC PASS semua
        $qc = $this->qcMode();
        if ($qc['type'] === 'none') {
            throw new ConflictHttpException('QC field tidak ditemukan di sample_tests. Tidak bisa membuat CoA.');
        }

        $qcFailExists = \App\Models\SampleTest::query()
            ->where('sample_id', $sampleId)
            ->where(function ($q) use ($qc) {
                $field = $qc['field'];

                if ($qc['type'] === 'bool') {
                    $q->whereNull($field)->orWhere($field, '!=', true);
                    return;
                }

                // string mode
                $q->whereNull($field)->orWhere($field, '!=', (string) $qc['pass']);
            })
            ->exists();

        if ($qcFailExists) {
            throw new ConflictHttpException('QC harus PASS untuk semua test sebelum CoA dibuat.');
        }
    }

    public function generateForSample(int $sampleId, int $actorStaffId): Report
    {
        return DB::transaction(function () use ($sampleId, $actorStaffId) {
            /** @var Sample|null $sample */
            $sample = Sample::query()->where('sample_id', $sampleId)->first();
            if (!$sample) {
                throw new RuntimeException('Sample not found.');
            }

            $existing = \App\Models\Report::query()
                ->where('sample_id', $sampleId)
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

            if ($tests->isEmpty()) {
                throw new RuntimeException('Cannot generate report: no tests for this sample.');
            }

            // Require all tests validated; block cancelled/failed as well
            $notAllowed = $tests->first(fn($t) => !in_array($t->status, ['validated'], true));
            if ($notAllowed) {
                throw new RuntimeException('Cannot generate report: all tests must be validated.');
            }

            $reportNo = $this->numberGenerator->next();

            $report = Report::query()->create([
                'sample_id' => $sampleId,
                'report_no' => $reportNo,
                'generated_at' => now(),
                'generated_by' => $actorStaffId,
                'pdf_url' => 'about:blank', // placeholder, update later
                'is_locked' => false,
                'created_at' => now(),
                'updated_at' => null,
            ]);

            // Build report items by snapshotting current master + latest results
            $testIds = $tests->pluck('sample_test_id')->all();

            $testsFull = SampleTest::query()
                ->with([
                    'parameter:parameter_id,name',
                    'method:method_id,name',

                    // ✅ FIX: jangan pakai shorthand latestResult:... (bikin ambiguous di Postgres)
                    'latestResult' => function ($q) {
                        // paling aman untuk ofMany() + join subquery di Postgres
                        $q->select('test_results.*');
                    },

                    'latestResult.creator:staff_id,name',
                ])
                ->whereIn('sample_test_id', $testIds)
                ->orderBy('sample_test_id')
                ->get();

            // cache unit map sekali saja (hindari query per item, aman memory)
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

            // Bulk insert (fast, low memory)
            DB::table('report_items')->insert($items);

            // Create signature slots from roles table (QA_MANAGER + LH)
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
