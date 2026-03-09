<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleCrosscheckSubmitRequest;
use App\Models\Sample;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleCrosscheckController extends Controller
{
    public function submit(SampleCrosscheckSubmitRequest $request, Sample $sample): JsonResponse
    {
        $user = $request->user();

        $roleId =
            ($user?->staff?->role_id)
            ?? ($user?->role_id)
            ?? null;

        $ANALYST_ROLE_ID = 4;

        if ((int) $roleId !== $ANALYST_ROLE_ID) {
            return response()->json([
                'status' => 403,
                'error' => 'forbidden',
                'message' => 'Only Analyst can submit crosscheck.',
            ], 403);
        }

        $staffId =
            ($user?->staff?->staff_id)
            ?? ($user?->staff_id)
            ?? null;

        if (!$staffId) {
            return response()->json([
                'status' => 422,
                'error' => 'missing_staff',
                'message' => 'Staff context is missing for this user.',
            ], 422);
        }

        if (
            Schema::hasColumn('samples', 'batch_excluded_at') &&
            !empty($sample->batch_excluded_at)
        ) {
            return response()->json([
                'status' => 409,
                'error' => 'batch_item_excluded',
                'message' => 'This sample has been excluded from the active institutional batch.',
            ], 409);
        }

        $enteredRaw = (string) ($request->validated()['physical_label_code'] ?? '');
        $entered = strtoupper(trim($enteredRaw));

        $expectedRaw = (string) ($sample->lab_sample_code ?? '');
        $expected = strtoupper(trim($expectedRaw));

        if ($expected === '') {
            return response()->json([
                'status' => 409,
                'error' => 'missing_expected_code',
                'message' => 'Sample has no lab_sample_code yet; cannot crosscheck.',
            ], 409);
        }

        $noteRaw = $request->validated()['note'] ?? null;
        $note = is_string($noteRaw) ? trim($noteRaw) : null;

        $isMatch = $entered === $expected;

        if (!$isMatch && (!$note || trim($note) === '')) {
            return response()->json([
                'status' => 422,
                'error' => 'note_required',
                'message' => 'Note is required when crosscheck fails (mismatch).',
                'context' => [
                    'expected' => $expectedRaw,
                    'entered' => $enteredRaw,
                ],
            ], 422);
        }

        $oldState = [
            'crosscheck_status' => $sample->crosscheck_status ?? null,
            'physical_label_code' => $sample->physical_label_code ?? null,
            'crosschecked_at' => $sample->crosschecked_at ?? null,
            'crosschecked_by_staff_id' => $sample->crosschecked_by_staff_id ?? null,
            'crosscheck_note' => $sample->crosscheck_note ?? null,
        ];

        DB::transaction(function () use ($sample, $staffId, $enteredRaw, $isMatch, $note) {
            $sample->crosscheck_status = $isMatch ? 'passed' : 'failed';
            $sample->physical_label_code = $enteredRaw;
            $sample->crosschecked_at = now();
            $sample->crosschecked_by_staff_id = $staffId;
            $sample->crosscheck_note = $isMatch ? null : $note;

            $sample->save();
        });

        AuditLogger::logSampleCrosscheck(
            staffId: (int) $staffId,
            sampleId: (int) $sample->sample_id,
            result: $isMatch ? 'passed' : 'failed',
            expectedCode: (string) $expectedRaw,
            enteredCode: (string) $enteredRaw,
            note: $isMatch ? null : $note,
            oldState: $oldState
        );

        return response()->json([
            'status' => 200,
            'data' => [
                'sample_id' => $sample->sample_id,
                'lab_sample_code' => $sample->lab_sample_code,
                'crosscheck_status' => $sample->crosscheck_status,
                'physical_label_code' => $sample->physical_label_code,
                'crosschecked_at' => $sample->crosschecked_at,
                'crosschecked_by_staff_id' => $sample->crosschecked_by_staff_id,
                'crosscheck_note' => $sample->crosscheck_note,
                'request_batch_id' => $sample->request_batch_id ?? null,
                'request_batch_item_no' => $sample->request_batch_item_no ?? null,
                'request_batch_total' => $sample->request_batch_total ?? null,
            ],
        ]);
    }
}
