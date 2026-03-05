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

    public function index(Request $request)
    {
        if (!$this->isLabHead($request)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $q = trim((string)$request->query('q', ''));

        $rows = Staff::query()
            ->with(['role:role_id,name'])
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($w) use ($q) {
                    $w->where('name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%");
                });
            })
            ->orderBy('name')
            ->get(['staff_id', 'name', 'email', 'role_id', 'is_active', 'last_seen_at', 'created_at']);

        $now = now();
        $onlineThreshold = $now->copy()->subMinutes(15);

        $data = $rows->map(function ($s) use ($onlineThreshold) {
            $lastSeen = $s->last_seen_at ? \Illuminate\Support\Carbon::parse($s->last_seen_at) : null;

            return [
                'staff_id' => $s->staff_id,
                'name' => $s->name,
                'email' => $s->email,
                'role_id' => (int)$s->role_id,
                'is_active' => (bool)$s->is_active,
                'last_seen_at' => $lastSeen ? $lastSeen->toISOString() : null,
                'is_online' => $lastSeen ? $lastSeen->greaterThanOrEqualTo($onlineThreshold) : false,
                'created_at' => $s->created_at ? \Illuminate\Support\Carbon::parse($s->created_at)->toISOString() : null,
                'role' => $s->role ? [
                    'role_id' => (int)$s->role->role_id,
                    'name' => $s->role->name,
                ] : null,
            ];
        });

        return response()->json([
            'data' => $data,
            'meta' => ['total' => $data->count()],
        ]);
    }
}