<?php

namespace App\Services;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AuditEventService
{
    public const DOC_TEMPLATE_UPLOAD = 'DOC_TEMPLATE_UPLOAD';
    public const DOC_TEMPLATE_UPDATE_META = 'DOC_TEMPLATE_UPDATE_META';
    public const DOC_GENERATED = 'DOC_GENERATED';
    public const DOC_DOWNLOADED = 'DOC_DOWNLOADED';
    public const DOC_ACCESS_DENIED = 'DOC_ACCESS_DENIED';

    /**
     * Insert audit log row in a schema-tolerant way (won't crash if columns differ).
     */
    public function log(
        string $event,
        array $meta = [],
        ?string $entityType = null,
        ?int $entityId = null,
        ?int $actorId = null
    ): void {
        if (!Schema::hasTable('audit_logs')) {
            return;
        }

        $user = Auth::user();
        $actorId = $actorId ?? (int) ($user?->staff_id ?? $user?->id ?? 0);

        $now = now();
        $row = [];

        // event/action column
        if (Schema::hasColumn('audit_logs', 'action')) $row['action'] = $event;
        elseif (Schema::hasColumn('audit_logs', 'event')) $row['event'] = $event;
        elseif (Schema::hasColumn('audit_logs', 'type')) $row['type'] = $event;

        // actor column (best effort)
        if ($actorId > 0) {
            if (Schema::hasColumn('audit_logs', 'actor_id')) $row['actor_id'] = $actorId;
            elseif (Schema::hasColumn('audit_logs', 'actor_staff_id')) $row['actor_staff_id'] = $actorId;
            elseif (Schema::hasColumn('audit_logs', 'staff_id')) $row['staff_id'] = $actorId;
            elseif (Schema::hasColumn('audit_logs', 'created_by')) $row['created_by'] = $actorId;
        }

        // entity refs (optional)
        if ($entityType && Schema::hasColumn('audit_logs', 'entity_type')) $row['entity_type'] = $entityType;
        if ($entityId && $entityId > 0) {
            if (Schema::hasColumn('audit_logs', 'entity_id')) $row['entity_id'] = $entityId;
            elseif (Schema::hasColumn('audit_logs', 'ref_id')) $row['ref_id'] = $entityId;
        }

        // meta payload
        if (!empty($meta)) {
            $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (Schema::hasColumn('audit_logs', 'meta')) $row['meta'] = $metaJson;
            elseif (Schema::hasColumn('audit_logs', 'payload')) $row['payload'] = $metaJson;
            elseif (Schema::hasColumn('audit_logs', 'data')) $row['data'] = $metaJson;
            elseif (Schema::hasColumn('audit_logs', 'meta_json')) $row['meta_json'] = $metaJson;
        }

        // request info (optional)
        try {
            if (Schema::hasColumn('audit_logs', 'ip_address')) $row['ip_address'] = request()->ip();
            if (Schema::hasColumn('audit_logs', 'user_agent')) {
                $ua = (string) (request()->userAgent() ?? '');
                $row['user_agent'] = mb_substr($ua, 0, 250);
            }
        } catch (\Throwable) {
            // ignore
        }

        // timestamps
        if (Schema::hasColumn('audit_logs', 'created_at')) $row['created_at'] = $now;
        if (Schema::hasColumn('audit_logs', 'updated_at')) $row['updated_at'] = $now;

        // if we couldn't map event column, don't insert garbage
        if (empty($row)) return;

        try {
            DB::table('audit_logs')->insert($row);
        } catch (\Throwable) {
            // never crash main flow because audit logging failed
        }
    }
}
