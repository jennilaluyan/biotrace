<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleRequestStatusController extends Controller
{
    /**
     * POST /api/v1/samples/{sample}/request-status
     *
     * Body:
     * - target_status: string (next request_status)
     * - note: nullable string
     */
    public function update(Request $request, Sample $sample): JsonResponse
    {
        $data = $request->validate([
            'target_status' => ['required', 'string', 'max:32'],
            'note'          => ['nullable', 'string', 'max:255'],
        ]);

        $to   = (string) $data['target_status'];
        $from = (string) ($sample->request_status ?? 'draft');

        /** @var mixed $actor */
        $actor = Auth::user();

        // hanya staff yang boleh
        if (!$actor instanceof Staff) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // role gate: toleran untuk variasi nama role
        $roleName = strtolower(trim((string) ($actor->role?->name ?? '')));
        $allowedRoleNames = ['admin', 'administrator'];
        if (!in_array($roleName, $allowedRoleNames, true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // transition rule (step-by-step)
        $allowedTransitions = [
            'draft'               => ['submitted'],
            'returned'            => ['submitted'],
            'needs_revision'      => ['submitted'],
            'submitted'           => ['ready_for_delivery', 'needs_revision'],
            'ready_for_delivery'  => ['physically_received'],
            'physically_received' => [],
        ];

        $nextAllowed = $allowedTransitions[$from] ?? [];
        if (!in_array($to, $nextAllowed, true)) {
            return response()->json([
                'message' => 'You are not allowed to perform this request status transition.',
            ], 403);
        }

        DB::transaction(function () use ($sample, $from, $to, $actor, $data) {
            $sample->request_status = $to;

            // side effects timestamp
            if ($to === 'submitted' && empty($sample->submitted_at)) {
                $sample->submitted_at = now();
            }

            if ($to === 'physically_received' && empty($sample->physically_received_at)) {
                $sample->physically_received_at = now();
            }

            // optional: generate lab_sample_code kalau kolom ada
            if (Schema::hasColumn('samples', 'lab_sample_code')) {
                if ($to === 'physically_received' && empty($sample->lab_sample_code)) {
                    $sample->lab_sample_code =
                        'LAB-' . now()->format('Ymd') . '-' . str_pad((string) $sample->sample_id, 5, '0', STR_PAD_LEFT);
                }
            }

            $sample->save();

            // =========================
            // AUDIT LOG (schema-safe)
            // =========================
            if (Schema::hasTable('audit_logs')) {
                $cols = array_flip(Schema::getColumnListing('audit_logs'));

                $audit = [
                    'entity_name' => 'samples',
                    'entity_id'   => $sample->sample_id,
                    'action'      => 'SAMPLE_REQUEST_STATUS_CHANGED',
                    'old_values'  => json_encode(['request_status' => $from]),
                    'new_values'  => json_encode(['request_status' => $to]),
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ];

                // note/notes (ikut schema yang ada)
                if (isset($cols['notes'])) {
                    $audit['notes'] = $data['note'] ?? null;
                } elseif (isset($cols['note'])) {
                    $audit['note'] = $data['note'] ?? null;
                }

                // actor column mapping (ikut schema yang ada)
                $actorId = (int) ($actor->staff_id ?? $actor->getKey());
                if (isset($cols['staff_id'])) {
                    $audit['staff_id'] = $actorId;
                } elseif (isset($cols['performed_by'])) {
                    $audit['performed_by'] = $actorId;
                } elseif (isset($cols['actor_id'])) {
                    $audit['actor_id'] = $actorId;
                } elseif (isset($cols['created_by'])) {
                    $audit['created_by'] = $actorId;
                }

                // only insert columns that exist
                $auditInsert = array_intersect_key($audit, $cols);
                DB::table('audit_logs')->insert($auditInsert);
            }
        });

        return response()->json([
            'data' => [
                'sample_id'              => $sample->sample_id,
                'request_status'         => $sample->request_status,
                'submitted_at'           => $sample->submitted_at,
                'physically_received_at' => $sample->physically_received_at,
                'lab_sample_code'        => $sample->lab_sample_code ?? null,
            ],
        ], 200);
    }
}
