<?php

namespace App\Http\Controllers;

use App\Http\Requests\TestResultStoreRequest;
use App\Http\Requests\TestResultUpdateRequest;
use App\Models\AuditLog;
use App\Models\SampleTest;
use App\Models\TestResult;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class TestResultController extends Controller
{
    /**
     * POST /api/v1/sample-tests/{sampleTest}/results
     * Create a result for a sample test (Analyst/Operator only, only while in_progress).
     */
    public function store(TestResultStoreRequest $request, SampleTest $sampleTest): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'test_results']);
        }

        // staff PK kamu adalah staff_id
        $actorId = $user->{$user->getKeyName()} ?? null;
        if (!$actorId) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'test_results']);
        }

        $role = optional($user->role)->name;
        if (!in_array($role, ['Analyst', 'Operator'], true)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'test_results']);
        }

        if ($sampleTest->status !== 'in_progress') {
            return ApiResponse::error(
                'Test results are locked for this sample test status.',
                'UNPROCESSABLE_ENTITY',
                422,
                [
                    'resource' => 'test_results',
                    'details'  => ['from' => $sampleTest->status, 'allowed' => ['in_progress']],
                ]
            );
        }

        $data = $request->validated();

        // flags di DB NOT NULL (default {}), jadi jangan pernah simpan null
        $flags = $data['flags'] ?? [];
        if ($flags === null) {
            $flags = [];
        }

        $result = TestResult::create([
            'sample_test_id' => $sampleTest->sample_test_id,
            'created_by'     => $actorId,

            // kolom wajib (NOT NULL)
            'raw_data'       => [
                'input' => [
                    'value_raw'   => $data['value_raw'],
                    'value_final' => $data['value_final'] ?? null,
                    'unit_id'     => $data['unit_id'] ?? null,
                    'flags'       => $flags,
                ],
                'meta' => [
                    'actor_id' => $actorId,
                    'source'   => 'api',
                ],
            ],
            'calc_data'      => [],   // wajib NOT NULL
            'interpretation' => '',   // wajib NOT NULL
            'version_no'     => 1,    // default aman

            // kolom baru (nullable)
            'value_raw'      => $data['value_raw'],
            'value_final'    => $data['value_final'] ?? null,
            'unit_id'        => $data['unit_id'] ?? null,
            'flags'          => $flags,
        ]);

        // Audit (jangan mengganggu response kalau gagal)
        $this->writeAudit(
            $request,
            $user,
            'test_result',
            (int) $result->result_id,
            'TEST_RESULT_CREATED',
            null,
            [
                'result_id'      => $result->result_id,
                'sample_test_id' => $result->sample_test_id,
                'created_by'     => $result->created_by,
                'value_raw'      => $result->value_raw,
                'value_final'    => $result->value_final,
                'unit_id'        => $result->unit_id,
                'flags'          => $result->flags,
                'version_no'     => $result->version_no,
            ]
        );

        return ApiResponse::success(
            [
                'result_id'      => $result->result_id,
                'sample_test_id' => $result->sample_test_id,
                'value_raw'      => $result->value_raw,
                'value_final'    => $result->value_final,
                'unit_id'        => $result->unit_id,
                'flags'          => $result->flags,
                'version_no'     => $result->version_no,
                'created_by'     => $result->created_by,
                'created_at'     => optional($result->created_at)->toIso8601String(),
            ],
            'Test result created.',
            201,
            ['resource' => 'test_results']
        );
    }

    /**
     * PATCH /api/v1/test-results/{testResult}
     * Update result (Analyst/Operator only, only while its sample_test is in_progress).
     */
    public function update(TestResultUpdateRequest $request, TestResult $testResult): JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'test_results']);
        }

        $role = optional($user->role)->name;
        if (!in_array($role, ['Analyst', 'Operator'], true)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'test_results']);
        }

        // cek parent status
        $sampleTest = SampleTest::query()
            ->select(['sample_test_id', 'status'])
            ->where('sample_test_id', $testResult->sample_test_id)
            ->first();

        if (!$sampleTest) {
            return ApiResponse::error('Sample test not found for this test result.', 'NOT_FOUND', 404, ['resource' => 'test_results']);
        }

        if ($sampleTest->status !== 'in_progress') {
            return ApiResponse::error(
                'Test results are locked for this sample test status.',
                'UNPROCESSABLE_ENTITY',
                422,
                [
                    'resource' => 'test_results',
                    'details'  => ['from' => $sampleTest->status, 'allowed' => ['in_progress']],
                ]
            );
        }

        $data = $request->validated();

        // flags NOT NULL → jangan null
        $flags = array_key_exists('flags', $data) ? $data['flags'] : $testResult->flags;
        if ($flags === null) {
            $flags = [];
        }

        $old = [
            'result_id'      => $testResult->result_id,
            'sample_test_id' => $testResult->sample_test_id,
            'value_raw'      => $testResult->value_raw,
            'value_final'    => $testResult->value_final,
            'unit_id'        => $testResult->unit_id,
            'flags'          => $testResult->flags,
            'version_no'     => $testResult->version_no,
        ];

        $testResult->fill([
            'value_raw'   => array_key_exists('value_raw', $data) ? $data['value_raw'] : $testResult->value_raw,
            'value_final' => array_key_exists('value_final', $data) ? $data['value_final'] : $testResult->value_final,
            'unit_id'     => array_key_exists('unit_id', $data) ? $data['unit_id'] : $testResult->unit_id,
            'flags'       => $flags,
        ]);

        // bump version untuk tracking (karena kamu punya version_no)
        $testResult->version_no = (int) ($testResult->version_no ?? 1) + 1;

        // update raw_data supaya traceable
        $existingRaw = is_array($testResult->raw_data) ? $testResult->raw_data : [];
        $testResult->raw_data = array_merge($existingRaw, [
            'last_update' => [
                'value_raw'   => $testResult->value_raw,
                'value_final' => $testResult->value_final,
                'unit_id'     => $testResult->unit_id,
                'flags'       => $testResult->flags,
                'updated_at'  => now()->toIso8601String(),
                'actor_role'  => $role,
            ],
        ]);

        if (!is_array($testResult->calc_data)) {
            $testResult->calc_data = [];
        }

        if ($testResult->interpretation === null) {
            $testResult->interpretation = '';
        }

        $testResult->save();

        $new = [
            'result_id'      => $testResult->result_id,
            'sample_test_id' => $testResult->sample_test_id,
            'value_raw'      => $testResult->value_raw,
            'value_final'    => $testResult->value_final,
            'unit_id'        => $testResult->unit_id,
            'flags'          => $testResult->flags,
            'version_no'     => $testResult->version_no,
        ];

        $this->writeAudit(
            $request,
            $user,
            'test_result',
            (int) $testResult->result_id,
            'TEST_RESULT_UPDATED',
            $old,
            $new
        );

        return ApiResponse::success(
            [
                'result_id'      => $testResult->result_id,
                'sample_test_id' => $testResult->sample_test_id,
                'value_raw'      => $testResult->value_raw,
                'value_final'    => $testResult->value_final,
                'unit_id'        => $testResult->unit_id,
                'flags'          => $testResult->flags,
                'version_no'     => $testResult->version_no,
                'updated_at'     => optional($testResult->updated_at)->toIso8601String(),
            ],
            'Test result updated.',
            200,
            ['resource' => 'test_results']
        );
    }

    private function writeAudit(
        Request $request,
        $user,
        string $entityName,
        ?int $entityId,
        string $action,
        $oldValues = null,
        $newValues = null
    ): void {
        try {
            // NOTE:
            // Pastikan AuditLog model mengizinkan mass assignment:
            // - tambahkan protected $guarded = []; ATAU $fillable di App\Models\AuditLog
            AuditLog::create([
                'staff_id'    => $user?->staff_id ?? null,
                'entity_name' => $entityName,
                'entity_id'   => $entityId,
                'action'      => $action,
                'timestamp'   => now(),
                'ip_address'  => $request->ip(),
                'old_values'  => $oldValues,
                'new_values'  => $newValues,
            ]);
        } catch (\Throwable $e) {
            // jangan ganggu response API kalau audit gagal
            Log::warning('AuditLog write failed: ' . $e->getMessage());
        }
    }
}
