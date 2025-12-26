<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleRequestIntakeRequest;
use App\Models\Sample;
use App\Models\SampleRequest;
use App\Models\SampleTest;
use App\Support\AuditLogger;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SampleRequestIntakeController extends Controller
{
    public function store(SampleRequestIntakeRequest $request, SampleRequest $sampleRequest): JsonResponse
    {
        $data = $request->validated();

        // 1) Ambil staff_id yang benar (FK staffs.staff_id)
        $user = Auth::user();
        $staffId = AuditLogger::resolveStaffId($user);

        if (!$staffId) {
            return response()->json([
                'message' => 'Cannot determine staff_id from authenticated user. Ensure auth user has staff_id or relation staff->staff_id.',
            ], 500);
        }

        // 2) Guard status: request harus eligible
        $eligible = ['approved', 'handed_over_to_collector', 'scheduled_for_intake'];
        if (!in_array($sampleRequest->request_status, $eligible, true)) {
            return response()->json([
                'message' => 'Request is not eligible for intake.',
                'details' => [
                    'current_status' => $sampleRequest->request_status,
                    'eligible' => $eligible,
                ],
            ], 422);
        }

        // 3) FAIL: update request saja, jangan create sample
        if (($data['result'] ?? null) === 'fail') {
            $old = [
                'request_status' => $sampleRequest->request_status,
                'intake_result'  => $sampleRequest->intake_result ?? null,
            ];

            $sampleRequest->update([
                'request_status'     => 'intake_failed',
                'intake_result'      => 'fail',
                'intake_checked_by'  => $staffId,
                'intake_checked_at'  => Carbon::now('UTC'),
                'intake_notes'       => $data['intake_notes'] ?? null,
            ]);

            AuditLogger::logSampleIntakeFailed(
                $staffId,
                $sampleRequest->request_id,
                $old,
                [
                    'request_status' => $sampleRequest->request_status,
                    'intake_result'  => $sampleRequest->intake_result,
                    'intake_notes'   => $sampleRequest->intake_notes,
                ]
            );

            return response()->json([
                'message' => 'Intake failed. No sample created.',
                'request' => [
                    'request_id' => $sampleRequest->request_id,
                    'request_status' => $sampleRequest->request_status,
                    'intake_result' => $sampleRequest->intake_result,
                ],
            ], 200);
        }

        // 4) PASS: create sample + sample_tests + update request
        $receivedAt = !empty($data['received_at'])
            ? Carbon::parse($data['received_at'])->timezone('UTC')
            : Carbon::now('UTC');

        return DB::transaction(function () use ($sampleRequest, $staffId, $receivedAt, $data) {

            // 4.0 Guard: jangan create 2x
            $existingSample = Sample::where('request_id', $sampleRequest->request_id)->first();
            if ($existingSample) {
                return response()->json([
                    'message' => 'Sample already exists for this request.',
                    'sample' => [
                        'sample_id' => $existingSample->sample_id,
                        'request_id' => $existingSample->request_id,
                    ],
                ], 409);
            }

            // 4.1 Create sample
            $sample = Sample::create([
                'client_id' => $sampleRequest->client_id,
                'request_id' => $sampleRequest->request_id,
                'received_at' => $receivedAt,
                'current_status' => 'received',
                'created_by' => $staffId,

                // mapping request -> sample (biar aman kalau ada kolom NOT NULL)
                'sample_type' => $sampleRequest->intended_sample_type ?? null,
                'examination_purpose' => $sampleRequest->examination_purpose ?? null,
                'contact_history' => $sampleRequest->contact_history ?? null,
                'priority' => $sampleRequest->priority ?? null,
                'additional_notes' => $sampleRequest->additional_notes ?? null,
            ]);

            // 4.2 Create sample_tests dari items request
            $items = $sampleRequest->items()->get();
            $now = Carbon::now('UTC');

            foreach ($items as $it) {
                SampleTest::create([
                    'sample_id' => $sample->sample_id,
                    'parameter_id' => $it->parameter_id,
                    'assigned_to' => null,
                    'created_at' => $now, // aman kalau kolom ini ada
                ]);
            }

            // 4.3 Update request status => converted_to_sample
            $old = [
                'request_status' => $sampleRequest->request_status,
                'intake_result'  => $sampleRequest->intake_result ?? null,
            ];

            $sampleRequest->update([
                'request_status'     => 'converted_to_sample',
                'intake_result'      => 'pass',
                'intake_checked_by'  => $staffId,
                'intake_checked_at'  => Carbon::now('UTC'),
                'intake_notes'       => $data['intake_notes'] ?? null,
            ]);

            AuditLogger::logSampleIntakeCreatedSample(
                $staffId,
                $sampleRequest->request_id,
                $sample->sample_id,
                $old,
                [
                    'request_status' => $sampleRequest->request_status,
                    'intake_result'  => $sampleRequest->intake_result,
                    'intake_notes'   => $sampleRequest->intake_notes,
                    'created_sample_tests' => $items->count(),
                ]
            );

            return response()->json([
                'message' => 'Intake PASS. Sample created.',
                'request' => [
                    'request_id' => $sampleRequest->request_id,
                    'request_status' => $sampleRequest->request_status,
                ],
                'sample' => [
                    'sample_id' => $sample->sample_id,
                    'request_id' => $sample->request_id,
                    'current_status' => $sample->current_status,
                    'received_at' => $sample->received_at,
                ],
                'created_sample_tests' => $items->count(),
            ], 201);
        });
    }
}
