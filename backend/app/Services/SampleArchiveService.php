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
     *   data: [{ sample: ..., client: ..., report: ... }],
     *   meta: { page, per_page, total, last_page }
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
            ->where('current_status', '=', 'reported')
            ->orderByDesc((new Sample())->getKeyName());

        if ($q !== '') {
            $query->where(function ($qq) use ($q) {
                // sample fields
                $qq->where('lab_sample_code', 'like', "%{$q}%")
                    ->orWhere('sample_id', (int) $q);

                // client name
                $qq->orWhereHas('client', function ($qc) use ($q) {
                    $qc->where('name', 'like', "%{$q}%");
                });
            });
        }

        /** @var LengthAwarePaginator $paginator */
        $paginator = $query->paginate($perPage);

        $items = $paginator->items();
        $sampleIds = collect($items)->map(fn($s) => (int) $s->getKey())->values()->all();

        // Attach report summary if reports table exists
        $reportsBySampleId = collect();
        if (Schema::hasTable('reports') && !empty($sampleIds)) {
            $reportsBySampleId = DB::table('reports')
                ->whereIn('sample_id', $sampleIds)
                ->select([
                    'report_id',
                    'sample_id',
                    'report_no',
                    'file_url',
                    'created_at',
                ])
                ->get()
                ->keyBy('sample_id');
        }

        $data = [];
        foreach ($items as $sample) {
            $sid = (int) $sample->getKey();
            $data[] = [
                'sample' => $sample,
                'client' => $sample->client,
                'report' => $reportsBySampleId->get($sid),
            ];
        }

        return [
            'data' => $data,
            'meta' => [
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * Build a "complete detail bundle" for a reported sample.
     * Goal: one call returns everything FE needs for the archive detail page.
     */
    public function detail(Sample $sample): array
    {
        $sampleId = (int) $sample->getKey();

        $bundle = [
            'sample' => $sample,
            'client' => $sample->client,
        ];

        // =========================
        // Audit logs (history)
        // =========================
        if (Schema::hasTable('audit_logs')) {
            // We don’t assume exact column naming beyond the common ones used in this project.
            // If your schema differs, adjust the where keys below.
            $bundle['audit_logs'] = DB::table('audit_logs')
                ->where(function ($q) use ($sampleId) {
                    // common patterns in this repo: entity_table + entity_id
                    if (Schema::hasColumn('audit_logs', 'entity_table') && Schema::hasColumn('audit_logs', 'entity_id')) {
                        $q->where('entity_table', '=', 'samples')->where('entity_id', '=', $sampleId);
                        return;
                    }
                    // fallback: sample_id
                    if (Schema::hasColumn('audit_logs', 'sample_id')) {
                        $q->where('sample_id', '=', $sampleId);
                        return;
                    }
                    // last resort: do nothing (avoid SQL error)
                    $q->whereRaw('1=0');
                })
                ->orderByDesc('audit_log_id')
                ->limit(500)
                ->get();
        } else {
            $bundle['audit_logs'] = [];
        }

        // =========================
        // Reports / COA documents
        // =========================
        if (Schema::hasTable('reports')) {
            $bundle['reports'] = DB::table('reports')
                ->where('sample_id', '=', $sampleId)
                ->orderByDesc('report_id')
                ->get();

            if (Schema::hasTable('report_items')) {
                $bundle['report_items'] = DB::table('report_items')
                    ->whereIn('report_id', collect($bundle['reports'])->pluck('report_id')->values()->all())
                    ->orderBy('report_item_id')
                    ->get();
            } else {
                $bundle['report_items'] = [];
            }

            if (Schema::hasTable('report_signoffs')) {
                $bundle['report_signoffs'] = DB::table('report_signoffs')
                    ->whereIn('report_id', collect($bundle['reports'])->pluck('report_id')->values()->all())
                    ->orderBy('report_signoff_id')
                    ->get();
            } else {
                $bundle['report_signoffs'] = [];
            }
        } else {
            $bundle['reports'] = [];
            $bundle['report_items'] = [];
            $bundle['report_signoffs'] = [];
        }

        if (Schema::hasTable('coa_documents')) {
            $bundle['coa_documents'] = DB::table('coa_documents')
                ->where('sample_id', '=', $sampleId)
                ->orderByDesc('coa_document_id')
                ->get();
        } else {
            $bundle['coa_documents'] = [];
        }

        // =========================
        // Letter of Order (LOO)
        // =========================
        if (Schema::hasTable('letter_of_order_items')) {
            $looItem = DB::table('letter_of_order_items')
                ->where('sample_id', '=', $sampleId)
                ->orderByDesc('letter_of_order_item_id')
                ->first();

            $bundle['loo_item'] = $looItem;

            if ($looItem && Schema::hasTable('letter_of_orders') && isset($looItem->letter_of_order_id)) {
                $bundle['loo'] = DB::table('letter_of_orders')
                    ->where('letter_of_order_id', '=', (int) $looItem->letter_of_order_id)
                    ->first();
            } else {
                $bundle['loo'] = null;
            }
        } else {
            $bundle['loo_item'] = null;
            $bundle['loo'] = null;
        }

        // =========================
        // Sample tests & results
        // =========================
        if (Schema::hasTable('sample_tests')) {
            $bundle['sample_tests'] = DB::table('sample_tests')
                ->where('sample_id', '=', $sampleId)
                ->orderBy('sample_test_id')
                ->get();
        } else {
            $bundle['sample_tests'] = [];
        }

        if (Schema::hasTable('test_results')) {
            $bundle['test_results'] = DB::table('test_results')
                ->where('sample_id', '=', $sampleId)
                ->orderBy('test_result_id')
                ->get();
        } else {
            $bundle['test_results'] = [];
        }

        // =========================
        // Quality Cover
        // =========================
        if (Schema::hasTable('quality_covers')) {
            $bundle['quality_covers'] = DB::table('quality_covers')
                ->where('sample_id', '=', $sampleId)
                ->orderByDesc('quality_cover_id')
                ->get();
        } else {
            $bundle['quality_covers'] = [];
        }

        // =========================
        // Reagent Requests (if linked)
        // =========================
        if (Schema::hasTable('reagent_requests')) {
            $bundle['reagent_requests'] = DB::table('reagent_requests')
                ->where('sample_id', '=', $sampleId)
                ->orderByDesc('reagent_request_id')
                ->get();
        } else {
            $bundle['reagent_requests'] = [];
        }

        // =========================
        // Sample Comments
        // =========================
        if (Schema::hasTable('sample_comments')) {
            $bundle['sample_comments'] = DB::table('sample_comments')
                ->where('sample_id', '=', $sampleId)
                ->orderByDesc('sample_comment_id')
                ->get();
        } else {
            $bundle['sample_comments'] = [];
        }

        return $bundle;
    }
}
