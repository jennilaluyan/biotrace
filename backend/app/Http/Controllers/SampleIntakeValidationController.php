<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use App\Services\LabSampleCodeGenerator;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SampleIntakeValidationController extends Controller
{
    public function validateIntake(Sample $sample, LabSampleCodeGenerator $gen): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();

        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // role gate: OM atau LH boleh verifikasi/assign code
        $role = strtolower(trim((string) ($actor->role?->name ?? '')));
        $allowed = [
            'operational manager',
            'operational_manager',
            'om',
            'laboratory head',
            'lab head',
            'laboratory_head',
            'lab_head',
            'lh'
        ];
        if (!in_array($role, $allowed, true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ((string) $sample->request_status !== 'awaiting_verification') {
            return response()->json([
                'message' => 'Sample code can only be assigned when request_status is awaiting_verification.',
                'details' => ['request_status' => [$sample->request_status]],
            ], 422);
        }

        if (empty($sample->verified_at)) {
            return response()->json([
                'message' => 'Sample must be verified by OM/LH before assigning lab sample code.',
                'details' => ['verified_at' => [null]],
            ], 422);
        }

        $checklist = $sample->intakeChecklist()->first();
        if (!$checklist) {
            return response()->json([
                'message' => 'Intake checklist not found.',
            ], 422);
        }

        if (!$checklist->is_passed) {
            return response()->json([
                'message' => 'Intake checklist did not pass.',
            ], 422);
        }

        return DB::transaction(function () use ($sample, $actor, $gen) {

            $oldCode = (string) ($sample->lab_sample_code ?? '');

            // Idempotent: kalau sudah BML-xxx, jangan generate lagi
            if (preg_match('/^BML-\d+$/', $oldCode)) {
                return response()->json([
                    'data' => [
                        'sample_id' => $sample->sample_id,
                        'lab_sample_code' => $sample->lab_sample_code,
                    ],
                ], 200);
            }

            $code = $gen->nextCode();
            $sample->lab_sample_code = $code;

            // domain rule: setelah code di-assign → intake validated
            $sample->request_status = 'intake_validated';

            // set received_at jika masih null
            if (empty($sample->received_at)) {
                $sample->received_at = now();
            }

            // jangan utak-atik current_status (biar gak nabrak flow/test lain)
            $sample->save();

            AuditLogger::write(
                action: 'SAMPLE_INTAKE_VALIDATED',
                staffId: (int) $actor->staff_id,
                entityName: 'samples',
                entityId: (int) $sample->sample_id,
                oldValues: null,
                newValues: [
                    'validated' => true,
                ]
            );

            AuditLogger::write(
                action: 'LAB_SAMPLE_CODE_ASSIGNED',
                staffId: (int) $actor->staff_id,
                entityName: 'samples',
                entityId: (int) $sample->sample_id,
                oldValues: ['lab_sample_code' => $oldCode ?: null],
                newValues: ['lab_sample_code' => $code]
            );

            return response()->json([
                'data' => [
                    'sample_id' => $sample->sample_id,
                    'lab_sample_code' => $code,
                    'received_at' => $sample->received_at,
                ],
            ], 200);
        });
    }
}
