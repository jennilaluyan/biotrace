<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request as RequestFacade;
use Illuminate\Support\Carbon;

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
        $req = RequestFacade::instance();

        DB::table('audit_logs')->insert([
            'staff_id'    => $staffId,
            'entity_name' => $entityName,
            'entity_id'   => $entityId,
            'action'      => strtoupper($action),
            'timestamp'   => Carbon::now('UTC'),
            'ip_address'  => $req->ip(),
            'old_values'  => $oldValues ? json_encode($oldValues) : null,
            'new_values'  => $newValues ? json_encode($newValues) : null,
        ]);
    }

    /**
     * Optional wrapper: tetap bisa pakai AuditLogger::info()
     */
    public static function info(string $action, array $data = []): void
    {
        $staffId   = $data['staff_id'] ?? null;
        $entity    = $data['entity'] ?? null;
        $entityId  = $data['entity_id'] ?? null;
        $oldValues = $data['old'] ?? null;
        $newValues = $data['new'] ?? null;

        self::write(
            action: $action,
            staffId: $staffId,
            entityName: $entity ?? '-',
            entityId: $entityId,
            oldValues: $oldValues,
            newValues: $newValues
        );
    }

    /**
     * Helper: ambil staff_id yang benar dari authenticated user (FK staffs.staff_id)
     */
    public static function resolveStaffId($user): ?int
    {
        if (!$user) return null;

        return $user->staff_id
            ?? ($user->staff->staff_id ?? null);
    }

    // ============================================================
    // Existing sample wrappers (punya kamu)
    // ============================================================

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
                'data' => $newValues,
            ]
        );
    }

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

    // ============================================================
    // Step 7 wrappers (Sample Request + Intake)
    // ============================================================

    public static function logSampleRequestSubmitted(int $requestId, int $clientId, int $itemsCount): void
    {
        self::write(
            action: 'SAMPLE_REQUEST_SUBMITTED',
            staffId: null, // actor client portal
            entityName: 'sample_requests',
            entityId: $requestId,
            oldValues: null,
            newValues: [
                'client_id' => $clientId,
                'items_count' => $itemsCount,
                'request_status' => 'submitted',
            ]
        );
    }

    public static function logSampleRequestStatusUpdated(int $staffId, int $requestId, array $old, array $new): void
    {
        self::write(
            action: 'SAMPLE_REQUEST_STATUS_UPDATED',
            staffId: $staffId,
            entityName: 'sample_requests',
            entityId: $requestId,
            oldValues: $old,
            newValues: $new
        );
    }

    public static function logSampleRequestHandover(int $staffId, int $requestId, array $old, array $new): void
    {
        self::write(
            action: 'SAMPLE_REQUEST_HANDOVER',
            staffId: $staffId,
            entityName: 'sample_requests',
            entityId: $requestId,
            oldValues: $old,
            newValues: $new
        );
    }

    public static function logSampleIntakeCreatedSample(
        int $staffId,
        int $requestId,
        int $sampleId,
        array $old,
        array $new
    ): void {
        $new = array_merge($new, ['sample_id' => $sampleId]);

        self::write(
            action: 'SAMPLE_INTAKE_CREATED_SAMPLE',
            staffId: $staffId,
            entityName: 'sample_requests',
            entityId: $requestId,
            oldValues: $old,
            newValues: $new
        );
    }

    public static function logSampleIntakeFailed(int $staffId, int $requestId, array $old, array $new): void
    {
        self::write(
            action: 'SAMPLE_INTAKE_FAILED',
            staffId: $staffId,
            entityName: 'sample_requests',
            entityId: $requestId,
            oldValues: $old,
            newValues: $new
        );
    }
}
