<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SampleStatusHistoryController extends Controller
{
    /**
     * GET /api/v1/samples/{sample}/status-history
     */
    public function index(Request $request, Sample $sample): JsonResponse
    {
        $this->authorize('view', $sample);

        $actions = [
            'SAMPLE_STATUS_CHANGED',
            'SAMPLE_STATUS_UPDATED',
            'SAMPLE_STATUS_TRANSITIONED',
        ];

        $logs = AuditLog::query()
            ->with(['actor.role:role_id,name'])
            ->whereIn('action', $actions)
            ->where('entity_name', 'samples')
            ->where('entity_id', $sample->sample_id)
            ->orderByDesc('timestamp')
            ->get()
            ->map(function (AuditLog $log) {
                $old = is_array($log->old_values) ? $log->old_values : [];
                $new = is_array($log->new_values) ? $log->new_values : [];

                $from =
                    $old['current_status'] ??
                    $old['from_status'] ??
                    $old['status'] ??
                    $new['from_status'] ??
                    null;

                $to =
                    $new['current_status'] ??
                    $new['to_status'] ??
                    $new['status'] ??
                    $new['target_status'] ??
                    null;

                $note = $new['note'] ?? null;

                return [
                    'id' => $log->log_id,
                    'action' => $log->action,

                    // ✅ kirim ISO 8601 dengan offset (+00:00) supaya frontend bisa convert ke timezone user
                    'created_at' => $log->timestamp ? $log->timestamp->toIso8601String() : null,

                    'from_status' => $from,
                    'to_status' => $to,
                    'note' => $note,

                    'actor' => $log->actor ? [
                        'staff_id' => $log->actor->staff_id,
                        'name' => $log->actor->name,
                        'email' => $log->actor->email,
                        'role' => $log->actor->role ? [
                            'role_id' => $log->actor->role->role_id,
                            'name' => $log->actor->role->name,
                        ] : null,
                    ] : null,
                ];
            });

        return response()->json(['data' => $logs], 200);
    }
}