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

        $legacyGroups = [
            'sample_physical_condition' => 'Sample Physical Condition',
            'volume' => 'Volume',
            'identity' => 'Identity',
            'packing' => 'Packing',
            'supporting_documents' => 'Supporting Documents',
        ];

        $requiredItems = [
            // kondisi sampel / wadah
            'container_intact' => 'Wadah sampel dalam kondisi baik',
            'cap_sealed' => 'Tutup rapat / tersegel',
            'no_leakage' => 'Tidak bocor / tidak tumpah',
            'label_attached' => 'Label terpasang',
            'label_clear' => 'Label terbaca jelas',
            'label_matches_form' => 'Label sesuai data pada form',

            // volume / media
            'volume_sufficient' => 'Volume sampel cukup',
            'vtm_present' => 'Media/VTM tersedia (jika diperlukan)',

            // identitas & kesesuaian
            'identity_complete' => 'Identitas sampel lengkap',
            'sample_type_matches' => 'Jenis sampel sesuai permintaan',

            // packing/transport
            'packaging_intact' => 'Packing aman & tidak rusak',
            'triple_packaging' => 'Triple packaging sesuai SOP (jika diperlukan)',
            'temperature_condition_ok' => 'Kondisi suhu/transport sesuai (ice pack/cool box)',

            // dokumen pendukung
            'request_form_attached' => 'Form permintaan sampel terlampir',
            'chain_of_custody_attached' => 'Chain-of-custody terlampir (jika digunakan)',
            'other_docs_complete' => 'Dokumen pendukung lain lengkap',
        ];

        $normalized = [];

        // Legacy fallback (older UI)
        // Legacy fallback (older UI)
        if (!is_array($checks)) {
            $legacy = is_array($data['checklist'] ?? null) ? $data['checklist'] : [];
            $checks = [];
            // UI lama: mungkin hanya kirim 5 kategori
            foreach ($legacyGroups as $k => $_label) {
                if (array_key_exists($k, $legacy)) {
                    $checks[$k] = (bool) $legacy[$k];
                }
            }
        }

        // Tentukan mode:
        // - kalau ada minimal 1 item detail → pakai mode detail
        // - kalau tidak ada → fallback pakai 5 kategori lama
        $hasDetail = false;
        foreach (array_keys($requiredItems) as $dk) {
            if (is_array($checks) && array_key_exists($dk, $checks)) {
                $hasDetail = true;
                break;
            }
        }

        // Normalized output (yang disimpan ke JSON)
        $normalized = [];

        if ($hasDetail) {
            // ✅ Step 5 mode detail
            foreach ($requiredItems as $k => $label) {
                if (!array_key_exists($k, $checks)) {
                    return response()->json([
                        'message' => 'Validation error.',
                        'details' => [
                            ['field' => "checks.$k", 'message' => "$label wajib diisi."],
                        ],
                    ], 422);
                }

                $passed = $checks[$k] === true;
                $note = trim((string)($notesByKey[$k] ?? ''));

                if (!$passed && $note === '') {
                    return response()->json([
                        'message' => 'Validation error.',
                        'details' => [
                            ['field' => "notes.$k", 'message' => "Alasan wajib diisi jika '$label' FAIL."],
                        ],
                    ], 422);
                }

                $normalized[$k] = [
                    'passed' => $passed,
                    'note' => $note !== '' ? $note : null,
                    'label' => $label,
                ];
            }
        } else {
            // ✅ fallback mode lama (5 kategori)
            foreach ($legacyGroups as $k => $label) {
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
                    'label' => $label,
                ];
            }
        }

        $isPassed = true;
        foreach ($normalized as $row) {
            if (($row['passed'] ?? false) !== true) {
                $isPassed = false;
                break;
            }
        }

        DB::transaction(function () use ($sample, $actor, $normalized, $generalNote, $isPassed, $hasDetail) {
            SampleIntakeChecklist::create([
                'sample_id' => $sample->sample_id,
                'checklist' => [
                    'schema_version' => $hasDetail ? 2 : 1,
                    'mode' => $hasDetail ? 'detailed' : 'legacy',
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
                $sample->request_status = \App\Enums\SampleRequestStatus::AWAITING_VERIFICATION->value;

                // (Opsional tapi aman) seed received_at kalau null untuk konsistensi timestamp,
                // tapi tidak mempengaruhi lab workflow karena lab_sample_code masih null.
                if (empty($sample->received_at)) {
                    $seed = $sample->admin_received_from_client_at
                        ?? $sample->physically_received_at
                        ?? now();
                    $sample->received_at = Carbon::parse((string) $seed);
                }
            } else {
                $sample->request_status = \App\Enums\SampleRequestStatus::INSPECTION_FAILED->value;
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
                    ? 'Intake checklist passed — awaiting OM/LH verification'
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
