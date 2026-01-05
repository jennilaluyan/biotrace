<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\SampleTest;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class SampleTestController extends Controller
{
    /**
     * GET /api/v1/samples/{sample}/sample-tests
     * List sample tests for a given sample (used by Sample Details UI)
     */
    public function indexBySample(Request $request, Sample $sample)
    {
        // pastikan role boleh lihat sample (sesuai SamplePolicy)
        $this->authorize('view', $sample);

        $q = SampleTest::query()
            ->where('sample_id', $sample->sample_id)
            ->select([
                'sample_test_id',
                'sample_id',
                'parameter_id',
                'method_id',
                'assigned_to',
                'status',
                'started_at',
                'completed_at',
                'created_at',
                'updated_at',
            ])
            ->with([
                // minimal columns biar response ringan
                'parameter:parameter_id,code,name,unit,unit_id,method_ref,status,tag',
                'method:method_id,code,name,description,is_active',
                'assignee:staff_id,name,email,role_id,is_active',

                // ✅ FIX: avoid PGSQL "ambiguous column sample_test_id"
                // because latestResult uses a subquery join (ofMany) that also has sample_test_id
                'latestResult' => function ($rel) {
                    $rel->select([
                        'test_results.result_id',
                        'test_results.sample_test_id', // qualified to avoid ambiguity
                        'test_results.value_raw',
                        'test_results.value_final',
                        'test_results.unit_id',
                        'test_results.flags',
                        'test_results.version_no',
                        'test_results.created_by',
                        'test_results.created_at',
                    ]);
                },
            ])
            ->orderByDesc('sample_test_id');

        // optional filter
        if ($request->filled('status')) {
            $q->where('status', (string) $request->query('status'));
        }
        if ($request->filled('assigned_to')) {
            $q->where('assigned_to', (int) $request->query('assigned_to'));
        }

        $perPage = (int) $request->query('per_page', 50);
        $perPage = max(1, min($perPage, 100));

        return ApiResponse::success(
            $q->paginate($perPage),
            'Sample tests fetched',
            200,
            ['resource' => 'sample_tests']
        );
    }
}
