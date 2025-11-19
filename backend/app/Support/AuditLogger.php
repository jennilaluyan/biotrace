<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Request as RequestFacade;

class AuditLogger
{
    /**
     * Write audit trail log.
     *
     * @param  string      $action       e.g. LOGIN_SUCCESS, LOGIN_FAILURE
     * @param  int|null    $staffId      actor (harus staff_id)
     * @param  string      $entityName   nama entitas, e.g. 'staffs'
     * @param  int|null    $entityId     id entitas
     * @param  array|null  $oldValues    snapshot sebelum
     * @param  array|null  $newValues    snapshot sesudah
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

            'timestamp'   => now(),
            'ip_address'  => $req->ip(),

            'old_values'  => $oldValues ? json_encode($oldValues) : null,
            'new_values'  => $newValues ? json_encode($newValues) : null,
        ]);
    }
}
