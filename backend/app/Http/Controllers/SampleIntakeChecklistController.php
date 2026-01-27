<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleIntakeChecklistStoreRequest;
use App\Models\Sample;
use App\Models\SampleIntakeChecklist;
use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Support\LabSampleCode;
use Illuminate\Support\Carbon;
use Illuminate\Database\QueryException;

class SampleIntakeChecklistController extends Controller
{
    /**
     * POST /api/v1/samples/{sample}/intake-checklist
     *
     * Body (new):
     * - checks: { sample_physical_condition:boolean, volume:boolean, identity:boolean, packing:boolean, supporting_documents:boolean }
     * - notes:  { sample_physical_condition?:string|null, ... } (required if FAIL)
     * - note: optional general note
     *
     * Legacy still accepted:
     * - checklist: object { key:boolean, ... }
     * - notes: string|null
     */
    public function store(SampleIntakeChecklistStoreRequest $request, Sample $sample): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();

        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $roleName = strtolower(trim((string) ($actor->role?->name ?? '')));
        $allowed = ['sample collector', 'sample_collector', 'sample-collector'];
        if (!in_array($roleName, $allowed, true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // ✅ Step 5 gate: only when under_inspection
        if ((string) $sample->request_status !== 'under_inspection') {
            return response()->json([
                'message' => 'Intake checklist can only be submitted when request_status is under_inspection.',
            ], 422);
        }

        if ($sample->intakeChecklist()->exists()) {
            return response()->json([
                'message' => 'Intake checklist already submitted for this sample.',
            ], 409);
        }

        $data = $request->validated();

        // Normalize payload
        $checks = $data['checks'] ?? null;
        $notesByKey = is_array($data['notes'] ?? null) ? $data['notes'] : [];
        $generalNote = isset($data['note']) ? (string) $data['note'] : null;

        $requiredKeys = [
            'sample_physical_condition' => 'Sample Physical Condition',
            'volume' => 'Volume',
            'identity' => 'Identity',
            'packing' => 'Packing',
            'supporting_documents' => 'Supporting Documents',
        ];

        $normalized = [];

        // Legacy fallback (older UI)
        if (!is_array($checks)) {
            $legacy = is_array($data['checklist'] ?? null) ? $data['checklist'] : [];
            $checks = [];
            foreach ($requiredKeys as $k => $_label) {
                if (array_key_exists($k, $legacy)) {
                    $checks[$k] = (bool) $legacy[$k];
                }
            }
        }

        // Enforce presence (extra safety; request rules should already catch)
        foreach ($requiredKeys as $k => $label) {
            if (!array_key_exists($k, $checks)) {
                return response()->json([
                    'message' => 'Validation error.',
                    'details' => [
                        ['field' => "checks.$k", 'message' => "$label is required."],
                    ],
                ], 422);
            }

            $passed = $checks[$k] === true;
            $note = trim((string)($notesByKey[$k] ?? ''));

            if (!$passed && $note === '') {
                return response()->json([
                    'message' => 'Validation error.',
                    'details' => [
                        ['field' => "notes.$k", 'message' => "Reason is required when '$label' is FAIL."],
                    ],
                ], 422);
            }

            $normalized[$k] = [
                'passed' => $passed,
                'note' => $note !== '' ? $note : null,
            ];
        }

        $isPassed = true;
        foreach ($normalized as $row) {
            if ($row['passed'] !== true) {
                $isPassed = false;
                break;
            }
        }

        $nextStatus = $isPassed ? 'intake_checklist_passed' : 'rejected';

        DB::transaction(function () use ($sample, $actor, $normalized, $generalNote, $isPassed) {
            SampleIntakeChecklist::create([
                'sample_id' => $sample->sample_id,
                'checklist' => [
                    ...$normalized,
                    'general_note' => $generalNote ? trim($generalNote) : null,
                ],
                'notes' => $generalNote ? trim($generalNote) : null,
                'is_passed' => $isPassed,
                'checked_by' => (int) $actor->staff_id,
                'checked_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Step 5: record intake completed timestamp
            if (empty($sample->collector_intake_completed_at)) {
                $sample->collector_intake_completed_at = now();
            }

            // Promote / status update
            $old = (string) $sample->request_status;

            if ($isPassed) {
                // ✅ Step 6A: generate lab sample code (BML-XXX) if not exists yet
                if (empty($sample->lab_sample_code)) {
                    $tries = 0;
                    while (true) {
                        $tries++;
                        $sample->lab_sample_code = LabSampleCode::next('BML', 3);

                        try {
                            // don't save yet; we also want to fill received_at below
                            break;
                        } catch (QueryException $e) {
                            if ($tries >= 3) throw $e;
                        }
                    }
                }

                // ✅ ensure received_at for sorting in Samples list (if still null)
                if (empty($sample->received_at)) {
                    $seed = $sample->admin_received_from_client_at
                        ?? $sample->physically_received_at
                        ?? now();

                    $sample->received_at = Carbon::parse((string) $seed);
                }

                // ✅ "promoted": this makes it disappear from queue & appear in Samples
                $sample->request_status = 'intake_validated';
            } else {
                // Fail: keep your current behavior
                $sample->request_status = 'rejected';
            }

            $sample->save();

            AuditLogger::write(
                action: 'SAMPLE_INTAKE_CHECKLIST_SUBMITTED',
                staffId: (int) $actor->staff_id,
                entityName: 'samples',
                entityId: (int) $sample->sample_id,
                oldValues: null,
                newValues: [
                    'is_passed' => $isPassed,
                    'request_status' => $sample->request_status,
                    'lab_sample_code' => $sample->lab_sample_code ?? null,
                ]
            );

            AuditLogger::logSampleRequestStatusChanged(
                staffId: (int) $actor->staff_id,
                sampleId: (int) $sample->sample_id,
                clientId: (int) $sample->client_id,
                oldStatus: $old,
                newStatus: (string) $sample->request_status,
                note: $isPassed
                    ? 'Intake checklist passed — promoted to lab sample'
                    : 'Intake checklist failed'
            );

            AuditLogger::write(
                action: $isPassed ? 'SAMPLE_INTAKE_PASSED' : 'SAMPLE_INTAKE_FAILED',
                staffId: (int) $actor->staff_id,
                entityName: 'samples',
                entityId: (int) $sample->sample_id,
                oldValues: null,
                newValues: [
                    'is_passed' => $isPassed,
                    'lab_sample_code' => $sample->lab_sample_code ?? null,
                ]
            );
        });

        $fresh = $sample->fresh()->load('intakeChecklist');

        return response()->json([
            'data' => [
                'sample_id' => $fresh->sample_id,
                'request_status' => $fresh->request_status,
                'lab_sample_code' => $fresh->lab_sample_code ?? null,
                'collector_intake_completed_at' => $fresh->collector_intake_completed_at ?? null,
                'intake_checklist' => $fresh->intakeChecklist,
            ],
        ], 201);
    }
}