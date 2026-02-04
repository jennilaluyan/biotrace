<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request as RequestFacade;
use Illuminate\Support\Carbon;
use App\Enums\AuditAction;
use App\Support\AuditDiffBuilder;

class AuditLogger
{
    /**
     * Write audit trail log (fungsi dasar).
     */
    public static function write(
        string $action,
        ?int $staffId,
        string $entityName,
        ?int $entityId,
        ?array $oldValues = null,
        ?array $newValues = null
    ): void {

        // Jangan log kalau actor atau entity tidak ada
        if (is_null($staffId) || is_null($entityId)) {
            return;
        }

        $req = RequestFacade::instance();

        // normalize action
        $normalizedAction = strtoupper($action);

        foreach (AuditAction::cases() as $case) {
            if ($case->value === $normalizedAction) {
                $normalizedAction = $case->value;
                break;
            }
        }

        // ✅ DB column audit_logs.action is varchar(40) on your schema
        if (strlen($normalizedAction) > 40) {
            $normalizedAction = substr($normalizedAction, 0, 40);
        }

        DB::table('audit_logs')->insert([
            'staff_id'    => $staffId,
            'entity_name' => $entityName,
            'entity_id'   => $entityId,
            'action'      => $normalizedAction,
            'timestamp'   => Carbon::now('UTC'),
            'ip_address'  => $req->ip(),
            'old_values'  => $oldValues ? json_encode($oldValues) : null,
            'new_values'  => $newValues ? json_encode($newValues) : null,
        ]);
    }

    /**
     * ✅ Step 10.6 — Audit: testing stage moved (kanban move).
     * Entity: samples (entity_id = sample_id)
     */
    public static function logTestingStageMoved(
        int $staffId,
        int $sampleId,
        string $workflowGroup,
        int $boardId,
        ?int $fromColumnId,
        ?string $fromColumnName,
        int $toColumnId,
        ?string $toColumnName,
        ?int $eventId = null,
        ?string $note = null
    ): void {
        $oldValues = [
            'workflow_group' => $workflowGroup,
            'board_id' => $boardId,
            'from_column_id' => $fromColumnId,
            'from_column_name' => $fromColumnName,
        ];

        $newValues = [
            'workflow_group' => $workflowGroup,
            'board_id' => $boardId,
            'to_column_id' => $toColumnId,
            'to_column_name' => $toColumnName,
            'event_id' => $eventId,
            'note' => $note,
        ];

        self::write(
            action: 'TESTING_STAGE_MOVED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $oldValues,
            newValues: $newValues
        );
    }

    /**
     * ✅ Step 10.6 — Audit: testing column renamed.
     * Entity: testing_column (entity_id = column_id)
     */
    public static function logTestingColumnRenamed(
        int $staffId,
        int $columnId,
        int $boardId,
        string $workflowGroup,
        string $oldName,
        string $newName
    ): void {
        self::write(
            action: 'TESTING_COLUMN_RENAMED',
            staffId: $staffId,
            entityName: 'testing_column',
            entityId: $columnId,
            oldValues: [
                'board_id' => $boardId,
                'workflow_group' => $workflowGroup,
                'name' => $oldName,
            ],
            newValues: [
                'board_id' => $boardId,
                'workflow_group' => $workflowGroup,
                'name' => $newName,
            ]
        );
    }

    /**
     * ✅ Step 10.6 — Audit: testing column added.
     * Entity: testing_column (entity_id = column_id)
     */
    public static function logTestingColumnAdded(
        int $staffId,
        int $columnId,
        int $boardId,
        string $workflowGroup,
        string $name,
        int $position
    ): void {
        self::write(
            action: 'TESTING_COLUMN_ADDED',
            staffId: $staffId,
            entityName: 'testing_column',
            entityId: $columnId,
            oldValues: null,
            newValues: [
                'board_id' => $boardId,
                'workflow_group' => $workflowGroup,
                'name' => $name,
                'position' => $position,
            ]
        );
    }

    /**
     * ✅ Step 10.6 — Audit: testing columns reordered.
     * Entity: testing_board (entity_id = board_id)
     */
    public static function logTestingColumnsReordered(
        int $staffId,
        int $boardId,
        string $workflowGroup,
        array $oldOrder,
        array $newOrder
    ): void {
        self::write(
            action: 'TESTING_COLUMNS_REORDERED',
            staffId: $staffId,
            entityName: 'testing_board',
            entityId: $boardId,
            oldValues: [
                'workflow_group' => $workflowGroup,
                'columns' => $oldOrder,
            ],
            newValues: [
                'workflow_group' => $workflowGroup,
                'columns' => $newOrder,
            ]
        );
    }

    /**
     * Optional wrapper supaya bisa tetap pakai AuditLogger::info()
     * tanpa error intelephense.
     */
    public static function info(string $action, array $data = []): void
    {
        $staffId   = $data['staff_id']   ?? null;
        $entity    = $data['entity']     ?? null;
        $entityId  = $data['entity_id']  ?? null;
        $oldValues = $data['old']        ?? null;
        $newValues = $data['new']        ?? null;

        self::write(
            action: $action,
            staffId: $staffId,
            entityName: $entity,
            entityId: $entityId,
            oldValues: $oldValues,
            newValues: $newValues
        );
    }

    /**
     * Audit log untuk SAMPLE REGISTERED (first creation).
     */
    public static function logSampleRegistered(
        int $staffId,
        int $sampleId,
        int $clientId,
        array $newValues
    ): void {
        self::write(
            action: 'SAMPLE_REGISTERED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: null,
            newValues: [
                'client_id' => $clientId,
                'data'      => $newValues,
            ]
        );
    }

    /**
     * Audit log untuk perubahan status sample (workflow).
     */
    public static function logSampleStatusChanged(
        int $staffId,
        int $sampleId,
        int $clientId,
        string $oldStatus,
        string $newStatus,
        ?string $note = null
    ): void {
        // Build normalized diff (ISO-friendly)
        $diff = AuditDiffBuilder::fromArrays(
            ['status' => $oldStatus],
            ['status' => $newStatus]
        );

        // Tambahkan metadata tambahan kalau ada (tidak mengubah diff utama)
        if ($note !== null) {
            $diff['_meta'] = [
                'note' => $note,
                'client_id' => $clientId,
            ];
        } else {
            // tetap simpan client_id untuk traceability
            $diff['_meta'] = [
                'client_id' => $clientId,
            ];
        }

        self::write(
            action: 'SAMPLE_STATUS_CHANGED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $diff,
            newValues: null
        );
    }

    public static function logSampleRequestStatusChanged(
        int $staffId,
        int $sampleId,
        int $clientId,
        string $oldStatus,
        string $newStatus,
        ?string $note = null
    ): void {
        $diff = AuditDiffBuilder::fromArrays(
            ['request_status' => $oldStatus],
            ['request_status' => $newStatus]
        );

        if ($note !== null) {
            $diff['_meta'] = [
                'note' => $note,
                'client_id' => $clientId,
            ];
        } else {
            $diff['_meta'] = [
                'client_id' => $clientId,
            ];
        }

        self::write(
            action: 'SAMPLE_REQUEST_STATUS_CHANGED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $diff,
            newValues: null
        );
    }

    /**
     * Audit log untuk event physical workflow (ISO evidence friendly).
     * NOTE: AuditLogger::write() tidak punya parameter clientId, jadi kita simpan di new_values/_meta.
     */
    public static function logSamplePhysicalWorkflowEvent(
        int $staffId,
        int $sampleId,
        int $clientId,
        string $eventKey,
        array $oldValues,
        array $newValues,
        ?string $note = null
    ): void {
        $actionKey = 'SAMPLE_PHYSICAL_WORKFLOW_' .
            strtoupper(preg_replace('/[^a-z0-9]+/i', '_', $eventKey));

        $payloadNew = array_merge($newValues, [
            'event_key' => $eventKey,
            'note' => $note,
            '_meta' => [
                'client_id' => $clientId,
            ],
        ]);

        self::write(
            action: $actionKey,
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $oldValues,
            newValues: $payloadNew
        );
    }

    /**
     * ✅ Step 3: Audit log untuk verifikasi request oleh OM/LH.
     */
    public static function logSampleRequestVerified(
        int $staffId,
        int $sampleId,
        int $clientId,
        string $verifiedByRole,
        array $oldValues,
        array $newValues,
        ?string $note = null
    ): void {
        $payloadNew = array_merge($newValues, [
            'verified_by_role' => $verifiedByRole,
            'note' => $note,
            '_meta' => [
                'client_id' => $clientId,
            ],
        ]);

        self::write(
            action: 'SAMPLE_REQUEST_VERIFIED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $oldValues,
            newValues: $payloadNew
        );
    }

    /**
     * ✅ Step 2.6 — Audit log untuk Analyst Crosscheck (ISO trail).
     * Event minimal:
     * - SAMPLE_CROSSCHECK_PASSED
     * - SAMPLE_CROSSCHECK_FAILED
     * data: sample_id, expected_code, entered_code, actor_id, note
     */
    public static function logSampleCrosscheck(
        int $staffId,
        int $sampleId,
        string $result, // 'passed' | 'failed'
        string $expectedCode,
        string $enteredCode,
        ?string $note = null,
        ?array $oldState = null
    ): void {
        $resultNorm = strtolower(trim($result));
        $action = $resultNorm === 'passed'
            ? 'SAMPLE_CROSSCHECK_PASSED'
            : 'SAMPLE_CROSSCHECK_FAILED';

        $payload = [
            'sample_id'      => $sampleId,
            'expected_code'  => $expectedCode,
            'entered_code'   => $enteredCode,
            'actor_id'       => $staffId,
            'note'           => $note,
        ];

        self::write(
            action: $action,
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $oldState,
            newValues: $payload
        );
    }

    public static function logWorkflowGroupChanged(
        ?int $staffId,
        int $sampleId,
        int $clientId,
        ?string $oldGroup,
        ?string $newGroup,
        array $parameterIds
    ): void {
        // write() akan auto-skip jika staffId/entityId null
        $oldValues = [
            'workflow_group' => $oldGroup,
            '_meta' => [
                'client_id' => $clientId,
            ],
        ];

        $newValues = [
            'workflow_group' => $newGroup,
            'parameter_ids' => array_values(array_unique(array_map('intval', $parameterIds))),
            '_meta' => [
                'client_id' => $clientId,
            ],
        ];

        self::write(
            action: 'WORKFLOW_GROUP_CHANGED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: $oldValues,
            newValues: $newValues
        );
    }

    public static function logQualityCoverSaved(
        int $staffId,
        int $sampleId,
        int $qualityCoverId,
        string $status,
        ?string $workflowGroup = null,
        ?string $methodOfAnalysis = null
    ): void {
        self::write(
            action: 'QUALITY_COVER_SAVED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: null,
            newValues: [
                'sample_id' => $sampleId,
                'quality_cover_id' => $qualityCoverId,
                'status' => $status,
                'workflow_group' => $workflowGroup,
                'method_of_analysis' => $methodOfAnalysis,
            ]
        );
    }

    public static function logQualityCoverSubmitted(
        int $staffId,
        int $sampleId,
        int $qualityCoverId,
        string $workflowGroup,
        ?string $methodOfAnalysis = null
    ): void {
        self::write(
            action: 'QUALITY_COVER_SUBMITTED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: null,
            newValues: [
                'sample_id' => $sampleId,
                'quality_cover_id' => $qualityCoverId,
                'workflow_group' => $workflowGroup,
                'method_of_analysis' => $methodOfAnalysis,
            ]
        );
    }
}
