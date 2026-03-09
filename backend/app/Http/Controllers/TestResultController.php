<?php

namespace App\Http\Controllers;

use App\Events\TestResultSubmitted;
use App\Http\Requests\TestResultStoreRequest;
use App\Http\Requests\TestResultUpdateRequest;
use App\Models\AuditLog;
use App\Models\SampleTest;
use App\Models\TestResult;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TestResultController extends Controller
{
    public function store(TestResultStoreRequest $request, SampleTest $sampleTest): JsonResponse
    {
        [$user, $actorId, $role] = $this->resolveActor($request);

        if (!$user || !$actorId) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'test_results']);
        }

        if (!$this->isAllowedRole($role)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'test_results']);
        }

        if ($sampleTest->status !== 'in_progress') {
            return ApiResponse::error(
                'Test results are locked for this sample test status.',
                'UNPROCESSABLE_ENTITY',
                422,
                [
                    'resource' => 'test_results',
                    'details' => [
                        'from' => $sampleTest->status,
                        'allowed' => ['in_progress'],
                    ],
                ]
            );
        }

        $data = $request->validated();
        $flags = $this->normalizeFlags($data['flags'] ?? []);

        $result = TestResult::create([
            'sample_test_id' => $sampleTest->sample_test_id,
            'created_by' => $actorId,
            'raw_data' => [
                'input' => [
                    'value_raw' => $data['value_raw'],
                    'value_final' => $data['value_final'] ?? null,
                    'unit_id' => $data['unit_id'] ?? null,
                    'flags' => $flags,
                ],
                'meta' => [
                    'actor_id' => $actorId,
                    'source' => 'api',
                ],
            ],
            'calc_data' => [],
            'interpretation' => '',
            'version_no' => 1,
            'value_raw' => $data['value_raw'],
            'value_final' => $data['value_final'] ?? null,
            'unit_id' => $data['unit_id'] ?? null,
            'flags' => $flags,
        ]);

        $this->writeAudit(
            $request,
            $user,
            'test_result',
            (int) $result->result_id,
            'TEST_RESULT_CREATED',
            null,
            [
                'result_id' => $result->result_id,
                'sample_test_id' => $result->sample_test_id,
                'created_by' => $result->created_by,
                'value_raw' => $result->value_raw,
                'value_final' => $result->value_final,
                'unit_id' => $result->unit_id,
                'flags' => $result->flags,
                'version_no' => $result->version_no,
            ]
        );

        TestResultSubmitted::dispatch(
            (int) $result->result_id,
            (int) $sampleTest->sample_test_id,
            (int) $sampleTest->sample_id,
            (int) $actorId,
            'created'
        );

        $sampleMeta = $this->getSampleMeta((int) $sampleTest->sample_test_id);

        return ApiResponse::success(
            $this->buildStorePayload($result, $sampleMeta),
            'Test result created.',
            201,
            ['resource' => 'test_results']
        );
    }

    public function update(TestResultUpdateRequest $request, TestResult $testResult): JsonResponse
    {
        [$user, $actorId, $role] = $this->resolveActor($request);

        if (!$user || !$actorId) {
            return ApiResponse::error('Unauthenticated.', 'UNAUTHENTICATED', 401, ['resource' => 'test_results']);
        }

        if (!$this->isAllowedRole($role)) {
            return ApiResponse::error('Forbidden.', 'FORBIDDEN', 403, ['resource' => 'test_results']);
        }

        $sampleTest = SampleTest::query()
            ->select(['sample_test_id', 'sample_id', 'status'])
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
                    'details' => [
                        'from' => $sampleTest->status,
                        'allowed' => ['in_progress'],
                    ],
                ]
            );
        }

        $data = $request->validated();
        $flags = $this->normalizeFlags(array_key_exists('flags', $data) ? $data['flags'] : $testResult->flags);

        $old = [
            'result_id' => $testResult->result_id,
            'sample_test_id' => $testResult->sample_test_id,
            'value_raw' => $testResult->value_raw,
            'value_final' => $testResult->value_final,
            'unit_id' => $testResult->unit_id,
            'flags' => $testResult->flags,
            'version_no' => $testResult->version_no,
        ];

        $testResult->fill([
            'value_raw' => array_key_exists('value_raw', $data) ? $data['value_raw'] : $testResult->value_raw,
            'value_final' => array_key_exists('value_final', $data) ? $data['value_final'] : $testResult->value_final,
            'unit_id' => array_key_exists('unit_id', $data) ? $data['unit_id'] : $testResult->unit_id,
            'flags' => $flags,
        ]);

        $testResult->version_no = (int) ($testResult->version_no ?? 1) + 1;

        $existingRaw = is_array($testResult->raw_data) ? $testResult->raw_data : [];
        $testResult->raw_data = array_merge($existingRaw, [
            'last_update' => [
                'value_raw' => $testResult->value_raw,
                'value_final' => $testResult->value_final,
                'unit_id' => $testResult->unit_id,
                'flags' => $testResult->flags,
                'updated_at' => now()->toIso8601String(),
                'actor_role' => $role,
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
            'result_id' => $testResult->result_id,
            'sample_test_id' => $testResult->sample_test_id,
            'value_raw' => $testResult->value_raw,
            'value_final' => $testResult->value_final,
            'unit_id' => $testResult->unit_id,
            'flags' => $testResult->flags,
            'version_no' => $testResult->version_no,
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

        TestResultSubmitted::dispatch(
            (int) $testResult->result_id,
            (int) $sampleTest->sample_test_id,
            (int) $sampleTest->sample_id,
            (int) $actorId,
            'updated'
        );

        $sampleMeta = $this->getSampleMeta((int) $testResult->sample_test_id);

        return ApiResponse::success(
            $this->buildUpdatePayload($testResult, $sampleMeta),
            'Test result updated.',
            200,
            ['resource' => 'test_results']
        );
    }

    private function resolveActor(Request $request): array
    {
        $user = $request->user();
        $actorId = $user?->{$user->getKeyName()} ?? ($user?->staff_id ?? null);
        $role = optional($user?->role)->name;

        return [$user, $actorId, $role];
    }

    private function isAllowedRole(?string $role): bool
    {
        return in_array($role, ['Analyst', 'Operator'], true);
    }

    private function normalizeFlags(mixed $flags): array
    {
        return is_array($flags) ? $flags : [];
    }

    private function getSampleMeta(int $sampleTestId): ?object
    {
        return DB::table('sample_tests as st')
            ->join('samples as s', 's.sample_id', '=', 'st.sample_id')
            ->where('st.sample_test_id', $sampleTestId)
            ->first([
                's.sample_id',
                's.request_batch_id',
                's.request_batch_item_no',
                's.request_batch_total',
            ]);
    }

    private function buildStorePayload(TestResult $result, ?object $sampleMeta): array
    {
        return [
            'result_id' => $result->result_id,
            'sample_test_id' => $result->sample_test_id,
            'value_raw' => $result->value_raw,
            'value_final' => $result->value_final,
            'unit_id' => $result->unit_id,
            'flags' => $result->flags,
            'version_no' => $result->version_no,
            'created_by' => $result->created_by,
            'created_at' => optional($result->created_at)->toIso8601String(),
            'sample_id' => (int) ($sampleMeta->sample_id ?? 0),
            'request_batch_id' => $sampleMeta->request_batch_id ?? null,
            'request_batch_item_no' => $sampleMeta->request_batch_item_no ?? null,
            'request_batch_total' => $sampleMeta->request_batch_total ?? null,
        ];
    }

    private function buildUpdatePayload(TestResult $testResult, ?object $sampleMeta): array
    {
        return [
            'result_id' => $testResult->result_id,
            'sample_test_id' => $testResult->sample_test_id,
            'value_raw' => $testResult->value_raw,
            'value_final' => $testResult->value_final,
            'unit_id' => $testResult->unit_id,
            'flags' => $testResult->flags,
            'version_no' => $testResult->version_no,
            'updated_at' => optional($testResult->updated_at)->toIso8601String(),
            'sample_id' => (int) ($sampleMeta->sample_id ?? 0),
            'request_batch_id' => $sampleMeta->request_batch_id ?? null,
            'request_batch_item_no' => $sampleMeta->request_batch_item_no ?? null,
            'request_batch_total' => $sampleMeta->request_batch_total ?? null,
        ];
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
            AuditLog::create([
                'staff_id' => $user?->staff_id ?? null,
                'entity_name' => $entityName,
                'entity_id' => $entityId,
                'action' => $action,
                'timestamp' => now(),
                'ip_address' => $request->ip(),
                'old_values' => $oldValues,
                'new_values' => $newValues,
            ]);
        } catch (\Throwable $e) {
            Log::warning('AuditLog write failed: ' . $e->getMessage());
        }
    }
}
