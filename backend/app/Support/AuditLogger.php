<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request as RequestFacade;
use Illuminate\Support\Carbon;
use App\Enums\AuditAction;

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
        self::write(
            action: 'SAMPLE_STATUS_CHANGED',
            staffId: $staffId,
            entityName: 'samples',
            entityId: $sampleId,
            oldValues: ['status' => $oldStatus],
            newValues: [
                'status' => $newStatus,
                'client_id' => $clientId,
                'note' => $note,
            ]
        );
    }
}
