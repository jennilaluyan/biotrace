<?php

namespace App\Http\Controllers;

use App\Models\LetterOfOrder;
use App\Models\Staff;
use App\Services\LetterOfOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LetterOfOrderController extends Controller
{
    public function __construct(private readonly LetterOfOrderService $svc) {}

    private function assertStaffRoleAllowed(Staff $staff, array $allowedRoleIds): void
    {
        if (!in_array((int) $staff->role_id, $allowedRoleIds, true)) {
            abort(403, 'Forbidden.');
        }
    }

    private function approvalsTableExists(): bool
    {
        return Schema::hasTable('loo_sample_approvals');
    }

    private function buildDownloadUrl(LetterOfOrder $loa): string
    {
        return url("/api/v1/reports/documents/loo/{$loa->lo_id}/pdf");
    }

    private function attachApiAttributes(LetterOfOrder $loa): LetterOfOrder
    {
        $downloadUrl = $this->buildDownloadUrl($loa);

        $loa->setAttribute('download_url', $downloadUrl);
        $loa->setAttribute('pdf_url', $downloadUrl);

        return $loa;
    }

    private function resolveReadyApprovedSampleIds(array $sampleIds): array
    {
        $rows = DB::table('loo_sample_approvals')
            ->whereIn('sample_id', $sampleIds)
            ->whereIn('role_code', ['OM', 'LH'])
            ->whereNotNull('approved_at')
            ->get(['sample_id', 'role_code']);

        $seen = [];
        foreach ($rows as $row) {
            $sampleId = (int) $row->sample_id;
            $roleCode = (string) $row->role_code;

            if (!isset($seen[$sampleId])) {
                $seen[$sampleId] = ['OM' => false, 'LH' => false];
            }

            if ($roleCode === 'OM' || $roleCode === 'LH') {
                $seen[$sampleId][$roleCode] = true;
            }
        }

        $readyIds = [];
        foreach ($seen as $sampleId => $statuses) {
            if (!empty($statuses['OM']) && !empty($statuses['LH'])) {
                $readyIds[] = (int) $sampleId;
            }
        }

        return $readyIds;
    }

    private function ensureBulkSamplesBelongToSameClientAndBatch(array $sampleIds): array
    {
        $batchRows = DB::table('samples')
            ->whereIn('sample_id', $sampleIds)
            ->get(['sample_id', 'client_id', 'request_batch_id']);

        $clientIds = $batchRows
            ->pluck('client_id')
            ->map(fn($value) => (int) $value)
            ->unique()
            ->values()
            ->all();

        if (count($clientIds) > 1) {
            abort(response()->json([
                'message' => 'Selected samples must belong to the same client.',
                'code' => 'MIXED_CLIENTS_NOT_ALLOWED',
            ], 422));
        }

        $batchIds = $batchRows
            ->pluck('request_batch_id')
            ->map(fn($value) => trim((string) $value))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (count($batchIds) > 1) {
            abort(response()->json([
                'message' => 'Selected samples must belong to the same institutional batch.',
                'code' => 'MIXED_BATCHES_NOT_ALLOWED',
            ], 422));
        }

        return [
            'client_id' => $clientIds[0] ?? null,
            'request_batch_id' => $batchIds[0] ?? null,
        ];
    }

    public function generate(Request $request, int $sampleId): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertStaffRoleAllowed($staff, [5, 6]);

        $request->validate([
            'sample_ids' => ['nullable', 'array', 'min:1'],
            'sample_ids.*' => ['integer', 'min:1', 'distinct'],
        ]);

        if (!$this->approvalsTableExists()) {
            return response()->json([
                'message' => 'Approvals table not found. Run migrations.',
                'code' => 'APPROVALS_TABLE_MISSING',
            ], 500);
        }

        $sampleIds = $request->input('sample_ids');

        if (is_array($sampleIds) && count($sampleIds) > 0) {
            $sampleIds = array_values(array_unique(array_map('intval', $sampleIds)));
            $readyIds = $this->resolveReadyApprovedSampleIds($sampleIds);

            if (count($readyIds) <= 0) {
                return response()->json([
                    'message' => 'Tidak ada sampel yang sudah disetujui oleh OM dan LH.',
                    'code' => 'NO_READY_SAMPLES',
                ], 422);
            }

            $batchMeta = $this->ensureBulkSamplesBelongToSameClientAndBatch($readyIds);

            $loa = $this->svc->ensureDraftForSamples($readyIds, (int) $staff->staff_id);
            $loa->setAttribute('included_sample_ids', $readyIds);
            $loa->setAttribute('request_batch_id', $batchMeta['request_batch_id']);
        } else {
            $singleSampleId = (int) $sampleId;
            $readyIds = $this->resolveReadyApprovedSampleIds([$singleSampleId]);

            if (!in_array($singleSampleId, $readyIds, true)) {
                return response()->json([
                    'message' => 'Sample ini belum disetujui oleh OM dan LH.',
                    'code' => 'SAMPLE_NOT_READY',
                ], 422);
            }

            $loa = $this->svc->ensureDraftForSample($singleSampleId, (int) $staff->staff_id);
            $loa->setAttribute('included_sample_ids', [$singleSampleId]);
        }

        $loa = $loa->loadMissing(['signatures', 'items']);
        $loa = $this->attachApiAttributes($loa);

        return response()->json([
            'message' => 'LoO generated.',
            'data' => $loa,
        ], 201);
    }

    public function show(int $looId): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $loa = LetterOfOrder::query()
            ->where('lo_id', (int) $looId)
            ->first();

        if (!$loa) {
            return response()->json([
                'message' => 'LOO not found.',
                'code' => 'LOO_NOT_FOUND',
            ], 404);
        }

        $loa = $loa->loadMissing(['signatures', 'items']);
        $loa = $this->attachApiAttributes($loa);

        return response()->json([
            'message' => 'OK',
            'data' => $loa,
        ]);
    }

    public function signInternal(Request $request, int $loaId): JsonResponse
    {
        $request->validate([
            'role_code' => ['required', 'string', 'max:24'],
        ]);

        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $roleCode = strtoupper(trim((string) $request->input('role_code')));

        $actorRoleCode = match ((int) $staff->role_id) {
            5 => 'OM',
            6 => 'LH',
            default => null,
        };

        if (!$actorRoleCode || $actorRoleCode !== $roleCode) {
            return response()->json(['message' => 'Forbidden for this role_code.'], 403);
        }

        $loa = $this->svc->signInternal($loaId, (int) $staff->staff_id, $roleCode);

        return response()->json([
            'message' => 'Signed.',
            'data' => $loa->loadMissing(['signatures']),
        ]);
    }

    public function sendToClient(Request $request, int $loaId): JsonResponse
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            return response()->json(['message' => 'Authenticated staff not found.'], 500);
        }

        $this->assertStaffRoleAllowed($staff, [5]);

        $loa = $this->svc->sendToClient($loaId, (int) $staff->staff_id);

        return response()->json([
            'message' => 'Sent to client.',
            'data' => $loa,
        ]);
    }
}
