<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleWorkflowLogsController extends Controller
{
    /**
     * GET /api/v1/samples/{sample}/workflow-logs
     *
     * Returns audit logs for this sample enriched with:
     * - actor_name
     * - actor_role_name (display-friendly)
     * - occurred_at (performed_at || created_at)
     *
     * Shape is intentionally flexible to match FE extractActorFromLog().
     */
    public function index(Sample $sample): JsonResponse
    {
        // Respect sample policy (same as SampleController@show)
        $this->authorize('view', $sample);

        if (!Schema::hasTable('audit_logs')) {
            return response()->json(['data' => []], 200);
        }

        $auditCols = array_flip(Schema::getColumnListing('audit_logs'));

        // Determine staff table + columns (schema-tolerant)
        $staffTable = Schema::hasTable('staffs') ? 'staffs' : (Schema::hasTable('staff') ? 'staff' : null);
        $staffPk = null;
        $staffNameCol = null;
        $staffRoleIdCol = null;

        if ($staffTable) {
            $staffCols = array_flip(Schema::getColumnListing($staffTable));
            $staffPk = isset($staffCols['staff_id']) ? 'staff_id' : (isset($staffCols['id']) ? 'id' : null);

            foreach (['name', 'full_name', 'staff_name'] as $c) {
                if (isset($staffCols[$c])) {
                    $staffNameCol = $c;
                    break;
                }
            }

            $staffRoleIdCol = isset($staffCols['role_id']) ? 'role_id' : null;
        }

        // Determine roles table + columns (schema-tolerant)
        $rolesTable = Schema::hasTable('roles') ? 'roles' : null;
        $rolePk = null;
        $roleNameCol = null;

        if ($rolesTable) {
            $roleCols = array_flip(Schema::getColumnListing($rolesTable));
            $rolePk = isset($roleCols['role_id']) ? 'role_id' : (isset($roleCols['id']) ? 'id' : null);

            foreach (['name', 'role_name', 'label'] as $c) {
                if (isset($roleCols[$c])) {
                    $roleNameCol = $c;
                    break;
                }
            }
        }

        // Pick actor id expression from whatever columns exist in audit_logs
        $actorIdCols = array_values(array_filter([
            isset($auditCols['staff_id']) ? 'staff_id' : null,
            isset($auditCols['performed_by']) ? 'performed_by' : null,
            isset($auditCols['user_id']) ? 'user_id' : null,
            isset($auditCols['causer_id']) ? 'causer_id' : null,
            isset($auditCols['created_by']) ? 'created_by' : null,
        ]));

        $actorExpr = null;
        if (count($actorIdCols) === 1) {
            $actorExpr = 'al.' . $actorIdCols[0];
        } elseif (count($actorIdCols) > 1) {
            $actorExpr = 'COALESCE(' . implode(', ', array_map(fn($c) => 'al.' . $c, $actorIdCols)) . ')';
        }

        $q = DB::table('audit_logs as al');

        // Filter only sample-related logs
        if (isset($auditCols['entity_name']) && isset($auditCols['entity_id'])) {
            $q->where('al.entity_name', 'samples')
                ->where('al.entity_id', (int) $sample->sample_id);
        } else {
            // Fallback: if schema is weird, return empty rather than wrong data
            return response()->json(['data' => []], 200);
        }

        // Join staff + roles if possible
        if ($staffTable && $staffPk && $actorExpr) {
            $q->leftJoin($staffTable . ' as st', function ($join) use ($staffPk, $actorExpr) {
                $join->on('st.' . $staffPk, '=', DB::raw($actorExpr));
            });

            if ($rolesTable && $rolePk && $roleNameCol && $staffRoleIdCol) {
                $q->leftJoin($rolesTable . ' as r', 'r.' . $rolePk, '=', 'st.' . $staffRoleIdCol);
            }
        }

        // Order by performed_at (preferred), else created_at
        if (isset($auditCols['performed_at'])) {
            $q->orderByDesc('al.performed_at');
        } elseif (isset($auditCols['created_at'])) {
            $q->orderByDesc('al.created_at');
        } else {
            // last resort
            $q->orderByDesc('al.entity_id');
        }

        $q->limit(300);

        // Select all audit log columns + actor enrichment
        $q->select('al.*');

        if ($staffTable && $staffNameCol) {
            $q->addSelect(DB::raw("st.{$staffNameCol} as actor_name"));
        }

        if ($rolesTable && $roleNameCol) {
            $q->addSelect(DB::raw("r.{$roleNameCol} as actor_role_db"));
        }

        if ($staffTable && $staffRoleIdCol) {
            $q->addSelect(DB::raw("st.{$staffRoleIdCol} as actor_role_id"));
        }

        $rows = $q->get();

        $out = [];
        foreach ($rows as $row) {
            $new = $this->tryJson($row->new_values ?? null);
            $old = $this->tryJson($row->old_values ?? null);

            $rawRole = null;
            if (property_exists($row, 'actor_role_db') && is_string($row->actor_role_db)) {
                $rawRole = $row->actor_role_db;
            } elseif (property_exists($row, 'role_name') && is_string($row->role_name)) {
                $rawRole = $row->role_name;
            }

            $actorName = property_exists($row, 'actor_name') && is_string($row->actor_name)
                ? trim($row->actor_name)
                : null;

            $actorRoleDisplay = $this->roleDisplay($rawRole);

            $occurredAt =
                (property_exists($row, 'performed_at') && $row->performed_at) ? (string) $row->performed_at : ((property_exists($row, 'created_at') && $row->created_at) ? (string) $row->created_at : null);

            $action = is_string($row->action ?? null) ? (string) $row->action : null;

            $message = $this->messageFor($action, $new);

            // Provide both flat fields + object to satisfy FE extractActorFromLog()
            $out[] = array_filter([
                'id' => $row->audit_log_id ?? $row->id ?? null,

                'entity_name' => $row->entity_name ?? null,
                'entity_id' => $row->entity_id ?? null,

                'action' => $action,
                'message' => $message,

                'note' => $row->note ?? null,
                'meta' => $row->meta ?? null,

                'old_values' => $row->old_values ?? null,
                'new_values' => $row->new_values ?? null,

                // FE logAt() checks created_at / occurred_at / at
                'created_at' => $row->created_at ?? null,
                'performed_at' => $row->performed_at ?? null,
                'occurred_at' => $occurredAt,

                // FE extractActorFromLog() checks these keys
                'actor_name' => $actorName,
                'actor_role_name' => $actorRoleDisplay,

                'actor' => ($actorName || $actorRoleDisplay) ? array_filter([
                    'name' => $actorName,
                    'role_name' => $actorRoleDisplay,
                    'role_id' => $row->actor_role_id ?? null,
                ]) : null,
            ], fn($v) => $v !== null);
        }

        return response()->json(['data' => $out], 200);
    }

    private function tryJson($v): ?array
    {
        if (!is_string($v) || trim($v) === '') return null;
        try {
            $decoded = json_decode($v, true);
            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function roleDisplay(?string $raw): ?string
    {
        $s = trim((string) $raw);
        if ($s === '') return null;

        $k = strtolower($s);
        $k = str_replace(['-', ' '], '_', $k);
        $k = preg_replace('/_+/', '_', $k);

        if ($k === 'admin' || str_contains($k, 'administrator')) return 'Administrator';
        if ($k === 'samplecollector' || $k === 'sample_collector' || str_contains($k, 'sample_collector') || str_contains($k, 'sample_collector_demo') || str_contains($k, 'sample_collector')) {
            return 'Sample Collector';
        }
        if ($k === 'om' || $k === 'operational_manager' || str_contains($k, 'operational_manager') || str_contains($k, 'operationalmanager')) {
            return 'Operational Manager';
        }
        if ($k === 'lh' || $k === 'laboratory_head' || $k === 'lab_head' || str_contains($k, 'laboratory_head') || str_contains($k, 'lab_head') || str_contains($k, 'laboratoryhead')) {
            return 'Laboratory Head';
        }

        // fallback: keep DB role text
        return $s;
    }

    private function messageFor(?string $action, ?array $newValues): ?string
    {
        $a = strtoupper(trim((string) $action));
        if ($a === '') return null;

        if ($a === 'REQUEST_ACCEPTED') return 'admin accepted request';
        if ($a === 'REQUEST_RETURNED') return 'admin returned request';
        if ($a === 'REQUEST_PHYSICALLY_RECEIVED') return 'admin received sample from client';

        if ($a === 'SAMPLE_PHYSICAL_WORKFLOW_CHANGED') {
            $ek = null;
            if (is_array($newValues)) {
                $ek = $newValues['event_key'] ?? $newValues['eventKey'] ?? null;
            }
            return is_string($ek) && trim($ek) !== '' ? trim($ek) : 'sample physical workflow changed';
        }

        if (str_contains($a, 'INTAKE')) return 'intake checklist';
        if (str_contains($a, 'VERIFIED')) return 'verified intake';

        return null;
    }
}
