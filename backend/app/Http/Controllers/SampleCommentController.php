<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleCommentStoreRequest;
use App\Models\Sample;
use App\Models\SampleComment;
use App\Models\Staff;
use App\Support\AuditLogger;
use App\Support\SampleCommentVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SampleCommentController extends Controller
{
    /**
     * GET /api/v1/samples/{sample}/comments
     * Return comments yang visible untuk role user saat ini.
     */
    public function index(Request $request, Sample $sample): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();

        if (! $staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        // Pastikan user punya akses lihat sample (reuse SamplePolicy::view)
        $this->authorize('view', $sample);

        $roleId = $staff->role_id;

        $comments = SampleComment::query()
            ->with(['author:staff_id,name,email,role_id'])
            ->where('sample_id', $sample->sample_id)
            ->whereJsonContains('visible_to_role_ids', $roleId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $comments,
        ]);
    }

    /**
     * POST /api/v1/samples/{sample}/comments
     * Lab Head only. Comment akan ditargetkan ke role penanggung jawab berdasarkan status sample saat ini.
     */
    public function store(SampleCommentStoreRequest $request, Sample $sample): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();

        if (! $staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        // ✅ guard: Lab Head only
        // Kita pakai nama role dari relasi agar selaras dengan sistem policy kamu.
        $roleName = $staff->role?->name;
        if ($roleName !== 'Laboratory Head') {
            return response()->json(['message' => 'Only Laboratory Head can add comments.'], 403);
        }

        // Pastikan user boleh view sample juga
        $this->authorize('view', $sample);

        $body = trim($request->input('body'));

        $statusSnapshot = $sample->current_status;
        $visibleRoleIds = SampleCommentVisibility::visibleRoleIdsForStatus($statusSnapshot);

        if (empty($visibleRoleIds)) {
            return response()->json([
                'message' => 'No target role mapping for current sample status.',
            ], 422);
        }

        $comment = SampleComment::create([
            'sample_id' => $sample->sample_id,
            'staff_id' => $staff->staff_id,
            'body' => $body,
            'status_snapshot' => $statusSnapshot,
            'visible_to_role_ids' => $visibleRoleIds,
        ]);

        $comment->load(['author:staff_id,name,email,role_id']);

        // Audit log
        AuditLogger::write(
            'SAMPLE_COMMENT_ADDED',
            $staff->staff_id,
            'sample_comments',
            $comment->comment_id,
            null,
            [
                'sample_id' => $sample->sample_id,
                'status_snapshot' => $statusSnapshot,
                'visible_to_role_ids' => $visibleRoleIds,
                'body' => $body,
            ]
        );

        return response()->json([
            'message' => 'Comment added.',
            'data' => $comment,
        ], 201);
    }
}