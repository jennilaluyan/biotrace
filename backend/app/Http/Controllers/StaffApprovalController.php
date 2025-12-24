<?php

namespace App\Http\Controllers;

use App\Models\Staff;
use App\Support\AuditLogger;
use Illuminate\Http\Request;

class StaffApprovalController extends Controller
{
    private function isLabHead(Request $request): bool
    {
        return strtolower($request->user()?->role?->name ?? '') === 'laboratory head';
    }

    public function pending(Request $request)
    {
        if (!$this->isLabHead($request)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $pending = Staff::query()
            ->where('is_active', false)
            ->whereIn('role_id', [2, 3, 4, 5]) // yang boleh register
            ->orderByDesc('staff_id')
            ->get(['staff_id', 'name', 'email', 'role_id', 'is_active', 'created_at']);

        return response()->json([
            'data' => $pending,
            'meta' => ['total' => $pending->count()],
        ]);
    }

    public function approve(Request $request, Staff $staff)
    {
        if (!$this->isLabHead($request)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        // safety: lab head tidak approve lab head
        if ((int)$staff->role_id === 6) {
            return response()->json(['message' => 'Cannot approve Laboratory Head via this endpoint'], 422);
        }

        $old = ['is_active' => $staff->is_active];
        $staff->is_active = true;
        $staff->save();

        AuditLogger::write(
            'STAFF_APPROVE',
            $request->user()->getKey(),
            'staffs',
            $staff->getKey(),
            $old,
            ['is_active' => $staff->is_active]
        );

        return response()->json(['message' => 'Staff approved', 'data' => $staff]);
    }

    public function reject(Request $request, Staff $staff)
    {
        if (!$this->isLabHead($request)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if ((int)$staff->role_id === 6) {
            return response()->json(['message' => 'Cannot reject Laboratory Head via this endpoint'], 422);
        }

        // minimal: tetap nonaktif + catat audit
        $note = $request->validate([
            'note' => ['nullable', 'string', 'max:300']
        ]);

        AuditLogger::write(
            'STAFF_REJECT',
            $request->user()->getKey(),
            'staffs',
            $staff->getKey(),
            null,
            ['note' => $note['note'] ?? null]
        );

        return response()->json(['message' => 'Staff rejected (remains inactive)']);
    }
}
