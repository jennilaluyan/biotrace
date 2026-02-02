<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleCrosscheckSubmitRequest;
use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SampleCrosscheckController extends Controller
{
    /**
     * PATCH /v1/samples/{id}/crosscheck
     * body: { physical_label_code, note? }
     *
     * Rules:
     * - compare physical_label_code vs samples.lab_sample_code (normalize trim + uppercase)
     * - match => passed
     * - mismatch => failed + note required
     * - only Analyst role can submit
     * - on failed: physical workflow return-to-SC is enabled (timestamps handled by physical workflow endpoint)
     */
    public function submit(SampleCrosscheckSubmitRequest $request, Sample $sample): JsonResponse
    {
        $user = $request->user();

        // ===== Role gate: Analyst only =====
        $roleId =
            ($user?->staff?->role_id)
            ?? ($user?->role_id)
            ?? null;

        // Kamu bilang: hanya role analyst
        // Kalau role_id Analyst kamu beda, ganti nilai ini sesuai seed kamu.
        // Aku sengaja bikin "strict fail" biar tidak diam-diam kebobolan.
        $ANALYST_ROLE_ID = 4; // <-- sesuaikan jika di sistemmu Analyst bukan 4

        if ((int)$roleId !== $ANALYST_ROLE_ID) {
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

        $enteredRaw = (string)($request->validated()['physical_label_code'] ?? '');
        $entered = strtoupper(trim($enteredRaw));

        $expectedRaw = (string)($sample->lab_sample_code ?? '');
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

        $isMatch = ($entered === $expected);

        if (!$isMatch) {
            // mismatch => failed + note wajib (jawaban kamu: cukup non-empty)
            if (!$note || trim($note) === '') {
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
        }

        DB::transaction(function () use ($sample, $staffId, $enteredRaw, $isMatch, $note) {
            $sample->crosscheck_status = $isMatch ? 'passed' : 'failed';
            $sample->physical_label_code = $enteredRaw;
            $sample->crosschecked_at = now();
            $sample->crosschecked_by_staff_id = $staffId;
            $sample->crosscheck_note = $isMatch ? null : $note;

            // Optional safety: kalau sebelumnya failed lalu sekarang passed, kita biarkan return timestamps tetap ada
            // (karena itu audit). Kalau kamu mau reset saat passed, bilang nanti.
            $sample->save();
        });

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
            ],
        ]);
    }
}