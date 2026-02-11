<?php

namespace App\Services;

use App\Enums\SampleRequestStatus;
use App\Models\Sample;
use App\Models\SampleIdChangeRequest;
use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SampleIdService
{
    public function __construct(private readonly LabSampleCodeGenerator $gen) {}

    public function buildSuggestionPayload(Sample $sample): array
    {
        $suggested = $this->gen->suggestForSample($sample);

        $sample->loadMissing(['client', 'requestedParameters']);

        return [
            'sample_id' => (int) $sample->sample_id,
            'workflow_group' => $sample->workflow_group,
            'request_status' => $sample->request_status,
            'verified_at' => $sample->verified_at,
            'suggested_sample_id' => $suggested,
            'client' => $sample->client ? [
                'client_id' => (int) $sample->client->client_id,
                'name' => $sample->client->name,
                'email' => $sample->client->email,
            ] : null,
            'sample_type' => $sample->sample_type,
            'requested_parameters' => $sample->requestedParameters?->map(fn($p) => [
                'parameter_id' => (int) ($p->parameter_id ?? 0),
                'name' => $p->name ?? null,
            ])->values()->all() ?? [],
        ];
    }

    public function auditSuggestion(Staff $actor, Sample $sample, string $suggested): void
    {
        AuditLogger::write(
            action: 'SAMPLE_ID_SUGGESTED',
            staffId: (int) $actor->staff_id,
            entityName: 'samples',
            entityId: (int) $sample->sample_id,
            oldValues: null,
            newValues: [
                'suggested_sample_id' => $suggested,
                'workflow_group' => $sample->workflow_group,
            ]
        );
    }

    public function proposeChange(Staff $actor, Sample $sample, string $proposedRaw, ?string $note = null): SampleIdChangeRequest
    {
        if (!empty($sample->lab_sample_code)) {
            throw new \RuntimeException('Sample ID is already assigned.');
        }

        $rs = (string) ($sample->request_status ?? '');
        if ($rs !== SampleRequestStatus::WAITING_SAMPLE_ID_ASSIGNMENT->value) {
            throw new \RuntimeException('Sample can only propose change when request_status is waiting_sample_id_assignment.');
        }

        $suggested = $this->gen->suggestForSample($sample);
        $proposed = $this->gen->normalize($proposedRaw);

        if ($proposed === $suggested) {
            throw new \RuntimeException('Proposed sample id must be different from suggested sample id.');
        }

        $exists = Sample::query()
            ->where('lab_sample_code', $proposed)
            ->where('sample_id', '!=', $sample->sample_id)
            ->exists();

        if ($exists) {
            throw new \RuntimeException('Proposed sample id already exists.');
        }

        $now = Carbon::now();

        return DB::transaction(function () use ($actor, $sample, $suggested, $proposed, $note, $now) {
            $oldStatus = (string) ($sample->request_status ?? null);

            $cr = new SampleIdChangeRequest([
                'sample_id' => (int) $sample->sample_id,
                'suggested_sample_id' => $suggested,
                'proposed_sample_id' => $proposed,
                'status' => 'PENDING',
                'requested_by_staff_id' => (int) $actor->staff_id,
            ]);
            $cr->save();

            $sample->request_status = SampleRequestStatus::SAMPLE_ID_PENDING_VERIFICATION->value;
            $sample->save();

            AuditLogger::write(
                action: 'SAMPLE_ID_CHANGE_PROPOSED',
                staffId: (int) $actor->staff_id,
                entityName: 'samples',
                entityId: (int) $sample->sample_id,
                oldValues: [
                    'request_status' => $oldStatus,
                ],
                newValues: [
                    'request_status' => $sample->request_status,
                    'change_request_id' => (int) $cr->change_request_id,
                    'suggested_sample_id' => $suggested,
                    'proposed_sample_id' => $proposed,
                    'note' => is_string($note) && trim($note) !== '' ? trim($note) : null,
                    'created_at' => $now,
                ]
            );

            return $cr;
        }, 3);
    }

    public function approveChange(Staff $actor, SampleIdChangeRequest $cr, ?string $note = null): SampleIdChangeRequest
    {
        if (strtoupper((string) $cr->status) !== 'PENDING') {
            throw new \RuntimeException('Change request is not pending.');
        }

        $now = Carbon::now();

        return DB::transaction(function () use ($actor, $cr, $note, $now) {
            $cr->loadMissing('sample');

            $sample = $cr->sample;
            if (!$sample) {
                throw new \RuntimeException('Sample not found.');
            }

            $oldStatus = (string) ($sample->request_status ?? null);

            $cr->status = 'APPROVED';
            $cr->reviewed_by_staff_id = (int) $actor->staff_id;
            $cr->review_note = is_string($note) && trim($note) !== '' ? trim($note) : null;
            $cr->updated_at = Carbon::now('UTC');
            $cr->save();

            $sample->request_status = SampleRequestStatus::SAMPLE_ID_APPROVED_FOR_ASSIGNMENT->value;
            $sample->save();

            AuditLogger::write(
                action: 'SAMPLE_ID_CHANGE_APPROVED',
                staffId: (int) $actor->staff_id,
                entityName: 'sample_id_change_request',
                entityId: (int) $cr->change_request_id,
                oldValues: [
                    'status' => 'PENDING',
                    'sample_request_status' => $oldStatus,
                ],
                newValues: [
                    'status' => 'APPROVED',
                    'sample_request_status' => $sample->request_status,
                    'sample_id' => (int) $sample->sample_id,
                    'suggested_sample_id' => $cr->suggested_sample_id,
                    'proposed_sample_id' => $cr->proposed_sample_id,
                    'review_note' => $cr->review_note,
                    'reviewed_at' => $now,
                ]
            );

            return $cr;
        }, 3);
    }

    public function rejectChange(Staff $actor, SampleIdChangeRequest $cr, string $note): SampleIdChangeRequest
    {
        if (strtoupper((string) $cr->status) !== 'PENDING') {
            throw new \RuntimeException('Change request is not pending.');
        }

        $note = trim((string) $note);
        if ($note === '') {
            throw new \RuntimeException('Reject note is required.');
        }

        $now = Carbon::now();

        return DB::transaction(function () use ($actor, $cr, $note, $now) {
            $cr->loadMissing('sample');

            $sample = $cr->sample;
            if (!$sample) {
                throw new \RuntimeException('Sample not found.');
            }

            $oldStatus = (string) ($sample->request_status ?? null);

            $cr->status = 'REJECTED';
            $cr->reviewed_by_staff_id = (int) $actor->staff_id;
            $cr->review_note = $note;
            $cr->updated_at = Carbon::now('UTC');
            $cr->save();

            $sample->request_status = SampleRequestStatus::WAITING_SAMPLE_ID_ASSIGNMENT->value;
            $sample->save();

            AuditLogger::write(
                action: 'SAMPLE_ID_CHANGE_REJECTED',
                staffId: (int) $actor->staff_id,
                entityName: 'sample_id_change_request',
                entityId: (int) $cr->change_request_id,
                oldValues: [
                    'status' => 'PENDING',
                    'sample_request_status' => $oldStatus,
                ],
                newValues: [
                    'status' => 'REJECTED',
                    'sample_request_status' => $sample->request_status,
                    'sample_id' => (int) $sample->sample_id,
                    'suggested_sample_id' => $cr->suggested_sample_id,
                    'proposed_sample_id' => $cr->proposed_sample_id,
                    'review_note' => $cr->review_note,
                    'reviewed_at' => $now,
                ]
            );

            return $cr;
        }, 3);
    }

    public function assignFinal(Staff $actor, Sample $sample, ?string $inputSampleId = null): Sample
    {
        if (!empty($sample->lab_sample_code)) {
            return $sample;
        }

        $rs = (string) ($sample->request_status ?? '');

        $allowed = [
            SampleRequestStatus::WAITING_SAMPLE_ID_ASSIGNMENT->value,
            SampleRequestStatus::SAMPLE_ID_APPROVED_FOR_ASSIGNMENT->value,
        ];

        if (!in_array($rs, $allowed, true)) {
            throw new \RuntimeException('Sample ID can only be assigned when request_status is waiting_sample_id_assignment or sample_id_approved_for_assignment.');
        }

        if (!empty($inputSampleId) && $rs !== SampleRequestStatus::SAMPLE_ID_APPROVED_FOR_ASSIGNMENT->value) {
            throw new \RuntimeException('Override requires approval. Use propose-change first.');
        }

        $sample->loadMissing('intakeChecklist');

        if (empty($sample->verified_at)) {
            throw new \RuntimeException('Sample must be verified before assigning sample id.');
        }

        $checklist = $sample->intakeChecklist;
        if (!$checklist || (bool) ($checklist->is_passed ?? false) !== true) {
            throw new \RuntimeException('Only PASSED intake checklists can be assigned sample id.');
        }

        return DB::transaction(function () use ($actor, $sample, $rs, $inputSampleId) {
            $now = Carbon::now();

            $old = [
                'lab_sample_code' => $sample->lab_sample_code,
                'request_status' => $sample->request_status,
                'sample_id_prefix' => $sample->sample_id_prefix,
                'sample_id_number' => $sample->sample_id_number,
                'sample_id_assigned_at' => $sample->sample_id_assigned_at,
                'sample_id_assigned_by_staff_id' => $sample->sample_id_assigned_by_staff_id,
            ];

            $final = null;

            if ($rs === SampleRequestStatus::SAMPLE_ID_APPROVED_FOR_ASSIGNMENT->value) {
                $approved = SampleIdChangeRequest::query()
                    ->where('sample_id', $sample->sample_id)
                    ->where('status', 'APPROVED')
                    ->orderByDesc('change_request_id')
                    ->first();

                if (!$approved) {
                    throw new \RuntimeException('Approved change request not found.');
                }

                $final = $approved->proposed_sample_id;
            } else {
                $final = $this->gen->suggestForSample($sample);
            }

            $final = $this->gen->normalize($final);
            $parsed = $this->gen->parseNormalized($final);

            $exists = Sample::query()
                ->where('lab_sample_code', $final)
                ->where('sample_id', '!=', $sample->sample_id)
                ->exists();

            if ($exists) {
                throw new \RuntimeException('Sample ID already exists.');
            }

            $this->gen->ensureCounterAtLeast($parsed['prefix'], (int) $parsed['number']);

            $sample->lab_sample_code = $final;
            $sample->sample_id_prefix = $parsed['prefix'];
            $sample->sample_id_number = (int) $parsed['number'];
            $sample->sample_id_assigned_at = $now;
            $sample->sample_id_assigned_by_staff_id = (int) $actor->staff_id;

            $sample->request_status = SampleRequestStatus::INTAKE_VALIDATED->value;

            if (empty($sample->received_at)) {
                $sample->received_at = $now;
            }

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
                oldValues: $old,
                newValues: [
                    'lab_sample_code' => $sample->lab_sample_code,
                    'sample_id_prefix' => $sample->sample_id_prefix,
                    'sample_id_number' => $sample->sample_id_number,
                    'sample_id_assigned_at' => $sample->sample_id_assigned_at,
                    'sample_id_assigned_by_staff_id' => $sample->sample_id_assigned_by_staff_id,
                    'request_status' => $sample->request_status,
                ]
            );

            return $sample;
        }, 3);
    }
}
