<?php

namespace App\Services;

use App\Models\Sample;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleArchiveService
{
    /**
     * Archived samples = samples that are already "reported" (COA generated)
     *
     * Return shape:
     * {
     *   data: [SampleArchiveListItem],
     *   meta: { current_page, last_page, per_page, total }
     * }
     */
    public function paginate(array $filters): array
    {
        $perPage = (int) ($filters['per_page'] ?? 15);
        if ($perPage < 1) $perPage = 15;
        if ($perPage > 100) $perPage = 100;

        $q = trim((string) ($filters['q'] ?? ''));

        $query = Sample::query()
            ->with('client')
            ->when(Schema::hasColumn('samples', 'current_status'), fn($qq) => $qq->where('current_status', '=', 'reported'))
            ->orderByDesc((new Sample())->getKeyName());

        if ($q !== '') {
            $query->where(function ($qq) use ($q) {
                // sample fields
                if (Schema::hasColumn('samples', 'lab_sample_code')) {
                    $qq->where('lab_sample_code', 'like', "%{$q}%");
                }

                // numeric sample id
                if (ctype_digit($q)) {
                    $qq->orWhere('sample_id', '=', (int) $q);
                }

                // client name
                $qq->orWhereHas('client', function ($qc) use ($q) {
                    $qc->where('name', 'like', "%{$q}%");
                });

                // COA/report number (best-effort)
                if (Schema::hasTable('reports') && Schema::hasColumn('reports', 'sample_id')) {
                    $numberCol =
                        Schema::hasColumn('reports', 'report_no') ? 'report_no'
                        : (Schema::hasColumn('reports', 'number') ? 'number' : null);

                    if ($numberCol) {
                        $qq->orWhereExists(function ($sub) use ($q, $numberCol) {
                            $sub->selectRaw('1')
                                ->from('reports')
                                ->whereColumn('reports.sample_id', 'samples.sample_id')
                                ->where($numberCol, 'like', "%{$q}%");
                        });
                    }
                }
            });
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $query->paginate($perPage);

        $items = $paginator->items();
        $sampleIds = collect($items)->map(fn($s) => (int) $s->getKey())->values()->all();

        // -------------------------
        // LOO map: sample_id -> latest lo_id
        // -------------------------
        $loIdBySampleId = collect();
        $loById = collect();

        if (
            Schema::hasTable('letter_of_order_items')
            && Schema::hasColumn('letter_of_order_items', 'sample_id')
            && Schema::hasColumn('letter_of_order_items', 'lo_id')
            && !empty($sampleIds)
        ) {
            $loIdBySampleId = DB::table('letter_of_order_items')
                ->selectRaw('sample_id, MAX(lo_id) as lo_id')
                ->whereIn('sample_id', $sampleIds)
                ->groupBy('sample_id')
                ->get()
                ->keyBy('sample_id')
                ->map(fn($r) => (int) $r->lo_id);

            $loIds = $loIdBySampleId->values()->unique()->filter()->values()->all();

            if (
                !empty($loIds)
                && Schema::hasTable('letters_of_order')
                && Schema::hasColumn('letters_of_order', 'lo_id')
            ) {
                $loById = DB::table('letters_of_order')
                    ->whereIn('lo_id', $loIds)
                    ->get()
                    ->keyBy('lo_id');
            }
        }

        // -------------------------
        // Latest report per sample
        // -------------------------
        $reportBySampleId = collect();

        if (Schema::hasTable('reports') && Schema::hasColumn('reports', 'sample_id') && !empty($sampleIds)) {
            $reportIdCol =
                Schema::hasColumn('reports', 'report_id') ? 'report_id'
                : (Schema::hasColumn('reports', 'id') ? 'id' : null);

            if ($reportIdCol) {
                $reportIdBySample = DB::table('reports')
                    ->selectRaw("sample_id, MAX({$reportIdCol}) as report_id")
                    ->whereIn('sample_id', $sampleIds)
                    ->groupBy('sample_id')
                    ->get()
                    ->keyBy('sample_id')
                    ->map(fn($r) => (int) $r->report_id);

                $reportIds = $reportIdBySample->values()->unique()->filter()->values()->all();

                if (!empty($reportIds)) {
                    $reports = DB::table('reports')
                        ->whereIn($reportIdCol, $reportIds)
                        ->get()
                        ->keyBy('sample_id');

                    $reportBySampleId = $reports;
                }
            }
        }

        // -------------------------
        // Build flat list items (FE-friendly)
        // -------------------------
        $data = [];

        foreach ($items as $sample) {
            $sid = (int) $sample->getKey();

            $loId = $loIdBySampleId->get($sid);
            $loRow = $loId ? $loById->get($loId) : null;

            $reportRow = $reportBySampleId->get($sid);

            // best-effort columns
            $loNumber = $loRow?->number ?? null;
            $loGeneratedAt = $loRow?->generated_at ?? null;
            $loFileUrl = $loRow?->file_url ?? ($loRow?->pdf_url ?? null);

            $coaNumber =
                $reportRow?->report_no
                ?? ($reportRow?->number ?? null);

            $coaGeneratedAt =
                $reportRow?->generated_at
                ?? ($reportRow?->created_at ?? null);

            $coaFileUrl =
                $reportRow?->file_url
                ?? ($reportRow?->pdf_url ?? null);

            $archivedAt =
                (Schema::hasColumn('samples', 'archived_at') ? ($sample->archived_at ?? null) : null)
                ?? (Schema::hasColumn('samples', 'reported_at') ? ($sample->reported_at ?? null) : null)
                ?? ($sample->updated_at ?? null);

            $data[] = [
                'sample_id' => $sid,
                'lab_sample_code' => $sample->lab_sample_code ?? null,
                'workflow_group' => $sample->workflow_group ?? null,

                'client_id' => $sample->client_id ?? null,
                'client_name' => $sample->client?->name ?? null,

                'current_status' => $sample->current_status ?? null,
                'request_status' => $sample->request_status ?? null,

                'archived_at' => $archivedAt,

                'lo_id' => $loId ?: null,
                'lo_number' => $loNumber,
                'lo_generated_at' => $loGeneratedAt,
                'lo_file_url' => $loFileUrl,

                'coa_report_id' => $reportRow?->report_id ?? ($reportRow?->id ?? null),
                'coa_number' => $coaNumber,
                'coa_generated_at' => $coaGeneratedAt,
                'coa_file_url' => $coaFileUrl,
            ];
        }

        return [
            'data' => $data,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    /**
     * Build a "complete detail bundle" for a reported sample.
     * Goal: one call returns everything FE needs for the archive detail page.
     */
    public function detail(Sample $sample): array
    {
        $sample->loadMissing(['client', 'requestedParameters']);

        $sampleId = (int) $sample->getKey();

        // LOO (best-effort)
        $loId = null;
        $lo = null;

        if (
            Schema::hasTable('letter_of_order_items')
            && Schema::hasColumn('letter_of_order_items', 'sample_id')
            && Schema::hasColumn('letter_of_order_items', 'lo_id')
        ) {
            $loId = DB::table('letter_of_order_items')
                ->where('sample_id', '=', $sampleId)
                ->max('lo_id');

            if ($loId && Schema::hasTable('letters_of_order') && Schema::hasColumn('letters_of_order', 'lo_id')) {
                $lo = DB::table('letters_of_order')
                    ->where('lo_id', '=', (int) $loId)
                    ->first();
            }
        }

        // Reports / COA
        $reports = collect();
        $reportItems = collect();
        $reportSignoffs = collect();

        if (Schema::hasTable('reports') && Schema::hasColumn('reports', 'sample_id')) {
            $reportOrderCol =
                Schema::hasColumn('reports', 'report_id') ? 'report_id'
                : (Schema::hasColumn('reports', 'id') ? 'id' : (Schema::hasColumn('reports', 'created_at') ? 'created_at' : null));

            $rq = DB::table('reports')
                ->where('sample_id', '=', $sampleId);

            if ($reportOrderCol) {
                $rq->orderBy($reportOrderCol, 'desc');
            }

            $reports = $rq->get();

            $reportIds = $reports->pluck('report_id')->filter()->values()->all();

            if (!empty($reportIds) && Schema::hasTable('report_items') && Schema::hasColumn('report_items', 'report_id')) {
                $itemOrderCol =
                    Schema::hasColumn('report_items', 'report_item_id') ? 'report_item_id'
                    : (Schema::hasColumn('report_items', 'id') ? 'id'
                        : (Schema::hasColumn('report_items', 'created_at') ? 'created_at' : null));

                $q = DB::table('report_items')
                    ->whereIn('report_id', $reportIds);

                if ($itemOrderCol) {
                    $q->orderBy($itemOrderCol, $itemOrderCol === 'created_at' ? 'asc' : 'asc');
                }

                $reportItems = $q->get();
            }

            if (!empty($reportIds) && Schema::hasTable('report_signoffs') && Schema::hasColumn('report_signoffs', 'report_id')) {
                $signoffOrderCol =
                    Schema::hasColumn('report_signoffs', 'report_signoff_id') ? 'report_signoff_id'
                    : (Schema::hasColumn('report_signoffs', 'id') ? 'id'
                        : (Schema::hasColumn('report_signoffs', 'created_at') ? 'created_at' : null));

                $q = DB::table('report_signoffs')
                    ->whereIn('report_id', $reportIds);

                if ($signoffOrderCol) {
                    $q->orderBy($signoffOrderCol, $signoffOrderCol === 'created_at' ? 'asc' : 'asc');
                }

                $reportSignoffs = $q->get();
            }
        }

        // Audit logs (history) ✅ FIX: fallback order column
        $auditLogs = collect();
        if (Schema::hasTable('audit_logs')) {
            $auditOrderCol =
                Schema::hasColumn('audit_logs', 'audit_log_id') ? 'audit_log_id'
                : (Schema::hasColumn('audit_logs', 'id') ? 'id'
                    : (Schema::hasColumn('audit_logs', 'created_at') ? 'created_at' : null));

            $q = DB::table('audit_logs')
                ->where(function ($qq) use ($sampleId) {
                    if (Schema::hasColumn('audit_logs', 'entity_table') && Schema::hasColumn('audit_logs', 'entity_id')) {
                        $qq->where('entity_table', '=', 'samples')->where('entity_id', '=', $sampleId);
                        return;
                    }
                    if (Schema::hasColumn('audit_logs', 'sample_id')) {
                        $qq->where('sample_id', '=', $sampleId);
                        return;
                    }
                    $qq->whereRaw('1=0');
                })
                ->limit(500);

            if ($auditOrderCol) {
                $q->orderBy($auditOrderCol, 'desc');
            }

            $auditLogs = $q->get();
        }

        // Sample tests & results (best-effort ordering)
        $sampleTests = collect();
        if (Schema::hasTable('sample_tests') && Schema::hasColumn('sample_tests', 'sample_id')) {
            $orderCol =
                Schema::hasColumn('sample_tests', 'sample_test_id') ? 'sample_test_id'
                : (Schema::hasColumn('sample_tests', 'id') ? 'id'
                    : (Schema::hasColumn('sample_tests', 'created_at') ? 'created_at' : null));

            $q = DB::table('sample_tests')
                ->where('sample_id', '=', $sampleId);

            if ($orderCol) {
                $q->orderBy($orderCol, $orderCol === 'created_at' ? 'asc' : 'asc');
            }

            $sampleTests = $q->get();
        }

        $testResults = collect();
        if (Schema::hasTable('test_results') && Schema::hasColumn('test_results', 'sample_id')) {
            $orderCol =
                Schema::hasColumn('test_results', 'test_result_id') ? 'test_result_id'
                : (Schema::hasColumn('test_results', 'id') ? 'id'
                    : (Schema::hasColumn('test_results', 'created_at') ? 'created_at' : null));

            $q = DB::table('test_results')
                ->where('sample_id', '=', $sampleId);

            if ($orderCol) {
                $q->orderBy($orderCol, $orderCol === 'created_at' ? 'asc' : 'asc');
            }

            $testResults = $q->get();
        }

        // Quality Cover
        $qualityCovers = collect();
        if (Schema::hasTable('quality_covers') && Schema::hasColumn('quality_covers', 'sample_id')) {
            $orderCol =
                Schema::hasColumn('quality_covers', 'quality_cover_id') ? 'quality_cover_id'
                : (Schema::hasColumn('quality_covers', 'id') ? 'id'
                    : (Schema::hasColumn('quality_covers', 'created_at') ? 'created_at' : null));

            $q = DB::table('quality_covers')
                ->where('sample_id', '=', $sampleId);

            if ($orderCol) {
                $q->orderBy($orderCol, 'desc');
            }

            $qualityCovers = $q->get();
        }

        // Reagent requests (linked by lo_id in project kamu)
        $reagentRequests = collect();
        if ($loId && Schema::hasTable('reagent_requests') && Schema::hasColumn('reagent_requests', 'lo_id')) {
            $orderCol =
                Schema::hasColumn('reagent_requests', 'reagent_request_id') ? 'reagent_request_id'
                : (Schema::hasColumn('reagent_requests', 'id') ? 'id'
                    : (Schema::hasColumn('reagent_requests', 'created_at') ? 'created_at' : null));

            $q = DB::table('reagent_requests')
                ->where('lo_id', '=', (int) $loId);

            if ($orderCol) {
                $q->orderBy($orderCol, 'desc');
            }

            $reagentRequests = $q->get();
        }

        // Sample comments
        $sampleComments = collect();
        if (Schema::hasTable('sample_comments') && Schema::hasColumn('sample_comments', 'sample_id')) {
            $orderCol =
                Schema::hasColumn('sample_comments', 'sample_comment_id') ? 'sample_comment_id'
                : (Schema::hasColumn('sample_comments', 'id') ? 'id'
                    : (Schema::hasColumn('sample_comments', 'created_at') ? 'created_at' : null));

            $q = DB::table('sample_comments')
                ->where('sample_id', '=', $sampleId);

            if ($orderCol) {
                $q->orderBy($orderCol, 'desc');
            }

            $sampleComments = $q->get();
        }

        return [
            'sample' => $sample,
            'client' => $sample->client,

            'requested_parameters' => $sample->requestedParameters
                ? $sample->requestedParameters->map(fn($p) => [
                    'parameter_id' => (int) $p->parameter_id,
                    'name' => (string) $p->name,
                ])->values()->all()
                : [],

            'loo' => $lo,
            'lo_id' => $loId,

            'reports' => $reports,
            'report_items' => $reportItems,
            'report_signoffs' => $reportSignoffs,

            'audit_logs' => $auditLogs,

            'sample_tests' => $sampleTests,
            'test_results' => $testResults,

            'quality_covers' => $qualityCovers,
            'reagent_requests' => $reagentRequests,
            'sample_comments' => $sampleComments,
        ];
    }
}
