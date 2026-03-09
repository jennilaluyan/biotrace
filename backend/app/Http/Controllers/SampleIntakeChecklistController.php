<?php

namespace App\Http\Controllers;

use App\Enums\SampleRequestStatus;
use App\Http\Requests\SampleIntakeChecklistStoreRequest;
use App\Models\Sample;
use App\Models\SampleIntakeChecklist;
use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleIntakeChecklistController extends Controller
{
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

        $data = $request->validated();

        $checks = $data['checks'] ?? null;
        $notesByKey = is_array($data['notes'] ?? null) ? $data['notes'] : [];
        $generalNote = isset($data['note']) ? (string) $data['note'] : null;
        $applyToBatch = filter_var((string) ($request->input('apply_to_batch', '0')), FILTER_VALIDATE_BOOLEAN);

        $legacyGroups = [
            'sample_physical_condition' => 'Sample Physical Condition',
            'volume' => 'Volume',
            'identity' => 'Identity',
            'packing' => 'Packing',
            'supporting_documents' => 'Supporting Documents',
        ];

        $requiredItems = [
            'container_intact' => 'Wadah sampel dalam kondisi baik',
            'cap_sealed' => 'Tutup rapat / tersegel',
            'no_leakage' => 'Tidak bocor / tidak tumpah',
            'label_attached' => 'Label terpasang',
            'label_clear' => 'Label terbaca jelas',
            'label_matches_form' => 'Label sesuai data pada form',
            'volume_sufficient' => 'Volume sampel cukup',
            'vtm_present' => 'Media/VTM tersedia (jika diperlukan)',
            'identity_complete' => 'Identitas sampel lengkap',
            'sample_type_matches' => 'Jenis sampel sesuai permintaan',
            'packaging_intact' => 'Packing aman & tidak rusak',
            'triple_packaging' => 'Triple packaging sesuai SOP (jika diperlukan)',
            'temperature_condition_ok' => 'Kondisi suhu/transport sesuai (ice pack/cool box)',
            'request_form_attached' => 'Form permintaan sampel terlampir',
            'chain_of_custody_attached' => 'Chain-of-custody terlampir (jika digunakan)',
            'other_docs_complete' => 'Dokumen pendukung lain lengkap',
        ];

        if (!is_array($checks)) {
            $legacy = is_array($data['checklist'] ?? null) ? $data['checklist'] : [];
            $checks = [];

            foreach ($legacyGroups as $key => $_label) {
                if (array_key_exists($key, $legacy)) {
                    $checks[$key] = (bool) $legacy[$key];
                }
            }
        }

        $hasDetail = false;

        foreach (array_keys($requiredItems) as $detailKey) {
            if (is_array($checks) && array_key_exists($detailKey, $checks)) {
                $hasDetail = true;
                break;
            }
        }

        $normalized = [];

        if ($hasDetail) {
            foreach ($requiredItems as $key => $label) {
                if (!array_key_exists($key, $checks)) {
                    return response()->json([
                        'message' => 'Validation error.',
                        'details' => [
                            ['field' => "checks.$key", 'message' => "$label wajib diisi."],
                        ],
                    ], 422);
                }

                $passed = $checks[$key] === true;
                $note = trim((string) ($notesByKey[$key] ?? ''));

                if (!$passed && $note === '') {
                    return response()->json([
                        'message' => 'Validation error.',
                        'details' => [
                            ['field' => "notes.$key", 'message' => "Alasan wajib diisi jika '$label' FAIL."],
                        ],
                    ], 422);
                }

                $normalized[$key] = [
                    'passed' => $passed,
                    'note' => $note !== '' ? $note : null,
                    'label' => $label,
                ];
            }
        } else {
            foreach ($legacyGroups as $key => $label) {
                if (!array_key_exists($key, $checks)) {
                    return response()->json([
                        'message' => 'Validation error.',
                        'details' => [
                            ['field' => "checks.$key", 'message' => "$label is required."],
                        ],
                    ], 422);
                }

                $passed = $checks[$key] === true;
                $note = trim((string) ($notesByKey[$key] ?? ''));

                if (!$passed && $note === '') {
                    return response()->json([
                        'message' => 'Validation error.',
                        'details' => [
                            ['field' => "notes.$key", 'message' => "Reason is required when '$label' is FAIL."],
                        ],
                    ], 422);
                }

                $normalized[$key] = [
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

        $result = DB::transaction(function () use (
            $sample,
            $applyToBatch,
            $actor,
            $normalized,
            $generalNote,
            $isPassed,
            $hasDetail
        ) {
            $query = Sample::query();

            if (
                $applyToBatch &&
                Schema::hasColumn('samples', 'request_batch_id') &&
                !empty($sample->request_batch_id)
            ) {
                $query
                    ->where('client_id', $sample->client_id)
                    ->where('request_batch_id', $sample->request_batch_id);

                if (Schema::hasColumn('samples', 'batch_excluded_at')) {
                    $query->whereNull('batch_excluded_at');
                }

                if (Schema::hasColumn('samples', 'request_batch_item_no')) {
                    $query->orderBy('request_batch_item_no');
                }

                $query->orderBy('sample_id');
            } else {
                $query->whereKey($sample->getKey());
            }

            $targets = $query->lockForUpdate()->get();

            if ($targets->isEmpty()) {
                return response()->json([
                    'message' => 'No active samples available for intake checklist.',
                ], 404);
            }

            foreach ($targets as $target) {
                if ((string) $target->request_status !== 'under_inspection') {
                    return response()->json([
                        'message' => 'Intake checklist can only be submitted when request_status is under_inspection.',
                    ], 422);
                }

                if ($target->intakeChecklist()->exists()) {
                    return response()->json([
                        'message' => "Intake checklist already submitted for sample {$target->sample_id}.",
                    ], 409);
                }
            }

            $affectedIds = [];
            $failedDetachedIds = [];

            foreach ($targets as $target) {
                SampleIntakeChecklist::create([
                    'sample_id' => $target->sample_id,
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

                if (empty($target->collector_intake_completed_at)) {
                    $target->collector_intake_completed_at = now();
                }

                $oldStatus = (string) $target->request_status;

                if ($isPassed) {
                    $target->request_status = SampleRequestStatus::AWAITING_VERIFICATION->value;

                    if (empty($target->received_at)) {
                        $seed = $target->admin_received_from_client_at
                            ?? $target->physically_received_at
                            ?? now();

                        $target->received_at = Carbon::parse((string) $seed);
                    }
                } else {
                    $target->request_status = SampleRequestStatus::INSPECTION_FAILED->value;

                    if (
                        !empty($target->request_batch_id) &&
                        Schema::hasColumn('samples', 'batch_excluded_at')
                    ) {
                        $target->batch_excluded_at = now();

                        if (Schema::hasColumn('samples', 'batch_exclusion_reason')) {
                            $target->batch_exclusion_reason = 'intake_failed';
                        }

                        $failedDetachedIds[] = (int) $target->sample_id;
                    }
                }

                $target->save();

                $intakeAuditPayload = [
                    'is_passed' => $isPassed,
                    'request_status' => $target->request_status,
                    'lab_sample_code' => $target->lab_sample_code ?? null,
                    'checklist' => $normalized,
                    'notes' => $generalNote ? trim($generalNote) : null,
                ];

                AuditLogger::write(
                    action: 'SAMPLE_INTAKE_CHECKLIST_SUBMITTED',
                    staffId: (int) $actor->staff_id,
                    entityName: 'samples',
                    entityId: (int) $target->sample_id,
                    oldValues: null,
                    newValues: $intakeAuditPayload
                );

                AuditLogger::write(
                    action: $isPassed ? 'SAMPLE_INTAKE_PASSED' : 'SAMPLE_INTAKE_FAILED',
                    staffId: (int) $actor->staff_id,
                    entityName: 'samples',
                    entityId: (int) $target->sample_id,
                    oldValues: null,
                    newValues: $intakeAuditPayload
                );

                AuditLogger::logSampleRequestStatusChanged(
                    staffId: (int) $actor->staff_id,
                    sampleId: (int) $target->sample_id,
                    clientId: (int) $target->client_id,
                    oldStatus: $oldStatus,
                    newStatus: (string) $target->request_status,
                    note: $isPassed
                        ? 'Intake checklist passed - awaiting OM/LH verification'
                        : 'Intake checklist failed'
                );

                $affectedIds[] = (int) $target->sample_id;
            }

            return [
                'affected_ids' => $affectedIds,
                'failed_detached_ids' => $failedDetachedIds,
            ];
        });

        if ($result instanceof JsonResponse) {
            return $result;
        }

        $freshQuery = Sample::query()
            ->with('intakeChecklist')
            ->whereIn('sample_id', $result['affected_ids']);

        if (Schema::hasColumn('samples', 'request_batch_item_no')) {
            $freshQuery->orderBy('request_batch_item_no');
        }

        $fresh = $freshQuery
            ->orderBy('sample_id')
            ->get();

        $primary = $fresh->first();

        return response()->json([
            'data' => [
                'sample_id' => $primary?->sample_id,
                'request_status' => $primary?->request_status,
                'request_batch_id' => $primary?->request_batch_id ?? null,
                'batch_total' => $fresh->count(),
                'affected_sample_ids' => $result['affected_ids'],
                'failed_detached_sample_ids' => $result['failed_detached_ids'],
                'intake_checklist' => $primary?->intakeChecklist,
            ],
        ], 201);
    }
}
