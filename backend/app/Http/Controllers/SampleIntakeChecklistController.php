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

class SampleIntakeChecklistController extends Controller
{
    /**
     * POST /api/v1/samples/{sample}/intake-checklist
     *
     * Body:
     * - checklist: object { key: boolean, ... }
     * - notes: nullable string
     */
    public function store(SampleIntakeChecklistStoreRequest $request, Sample $sample): JsonResponse
    {
        /** @var mixed $actor */
        $actor = Auth::user();

        // staff only
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // role gate: Sample Collector only (case-insensitive)
        $roleName = strtolower(trim((string) ($actor->role?->name ?? '')));
        $allowed = [
            'sample collector',
            'sample_collector',
            'sample-collector',
        ];
        if (!in_array($roleName, $allowed, true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // must be physically_received
        if ((string) $sample->request_status !== 'physically_received') {
            return response()->json([
                'message' => 'Intake checklist can only be submitted when request_status is physically_received.',
            ], 422);
        }

        // prevent double submit
        if ($sample->intakeChecklist()->exists()) {
            return response()->json([
                'message' => 'Intake checklist already submitted for this sample.',
            ], 409);
        }

        $data = $request->validated();
        $checklist = (array) ($data['checklist'] ?? []);

        // Compute pass/fail: all boolean true
        // (Kalau ada false -> fail)
        $isPassed = true;
        foreach ($checklist as $v) {
            if ($v !== true) {
                $isPassed = false;
                break;
            }
        }

        DB::transaction(function () use ($sample, $actor, $checklist, $data, $isPassed) {

            SampleIntakeChecklist::create([
                'sample_id'  => $sample->sample_id,
                'checklist'  => $checklist,
                'notes'      => $data['notes'] ?? null,
                'is_passed'  => $isPassed,
                'checked_by' => (int) $actor->staff_id,
                'checked_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Audit: submitted
            AuditLogger::write(
                action: 'SAMPLE_INTAKE_CHECKLIST_SUBMITTED',
                staffId: (int) $actor->staff_id,
                entityName: 'samples',
                entityId: (int) $sample->sample_id,
                oldValues: null,
                newValues: [
                    'is_passed' => $isPassed,
                    'notes' => $data['notes'] ?? null,
                ]
            );

            // If fail -> return workflow (request_status = returned)
            if (!$isPassed) {
                $old = (string) $sample->request_status;

                $sample->request_status = 'returned';
                $sample->reviewed_at = $sample->reviewed_at ?? now(); // optional, aman
                $sample->save();

                AuditLogger::logSampleRequestStatusChanged(
                    staffId: (int) $actor->staff_id,
                    sampleId: (int) $sample->sample_id,
                    clientId: (int) $sample->client_id,
                    oldStatus: $old,
                    newStatus: 'returned',
                    note: 'Intake checklist failed'
                );

                AuditLogger::write(
                    action: 'SAMPLE_INTAKE_FAILED',
                    staffId: (int) $actor->staff_id,
                    entityName: 'samples',
                    entityId: (int) $sample->sample_id,
                    oldValues: ['is_passed' => true],
                    newValues: ['is_passed' => false]
                );
            } else {
                AuditLogger::write(
                    action: 'SAMPLE_INTAKE_PASSED',
                    staffId: (int) $actor->staff_id,
                    entityName: 'samples',
                    entityId: (int) $sample->sample_id,
                    oldValues: ['is_passed' => false],
                    newValues: ['is_passed' => true]
                );
            }
        });

        $fresh = $sample->fresh()->load('intakeChecklist');

        return response()->json([
            'data' => [
                'sample_id' => $fresh->sample_id,
                'request_status' => $fresh->request_status,
                'intake_checklist' => $fresh->intakeChecklist,
            ],
        ], 201);
    }
}
