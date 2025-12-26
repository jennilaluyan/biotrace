<?php

namespace App\Http\Controllers;

use App\Http\Requests\SampleRequestStoreRequest;
use App\Http\Requests\SampleRequestStatusUpdateRequest;
use App\Http\Requests\SampleRequestHandoverRequest;
use App\Models\SampleRequest;
use App\Models\SampleRequestItem;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SampleRequestController extends Controller
{
    // GET /api/v1/sample-requests
    public function index(Request $request)
    {
        $this->authorize('viewAny', SampleRequest::class);

        $status   = $request->query('status');
        $clientId = $request->query('client_id');

        $q = SampleRequest::query()
            ->with(['client', 'items.parameter'])
            ->orderByDesc('request_id');

        // kalau login sebagai client portal, batasi ke miliknya
        $user = $request->user();
        if ($user instanceof \App\Models\Client) {
            $q->where('client_id', $user->client_id);
        } else {
            if ($clientId) $q->where('client_id', $clientId);
        }

        if ($status) $q->where('request_status', $status);

        return response()->json([
            'data' => $q->paginate(15),
        ]);
    }

    // GET /api/v1/sample-requests/{request}
    public function show(Request $request, SampleRequest $sampleRequest)
    {
        $this->authorize('view', $sampleRequest);

        $sampleRequest->load(['client', 'items.parameter', 'sample']);

        return response()->json([
            'data' => $sampleRequest,
        ]);
    }

    // POST /api/v1/sample-requests  (client submit)
    public function store(SampleRequestStoreRequest $request)
    {
        $this->authorize('create', SampleRequest::class);

        $user = $request->user();
        if (!($user instanceof \App\Models\Client)) {
            return response()->json(['message' => 'Only client can create request'], 403);
        }

        return DB::transaction(function () use ($request, $user) {
            $req = SampleRequest::create([
                'client_id'            => $user->client_id,
                'intended_sample_type' => $request->input('intended_sample_type'),
                'examination_purpose'  => $request->input('examination_purpose'),
                'contact_history'      => $request->input('contact_history'),
                'priority'             => $request->input('priority'),
                'additional_notes'     => $request->input('additional_notes'),
                'request_status'       => 'submitted',
            ]);

            $items = $request->input('items', []);
            foreach ($items as $it) {
                SampleRequestItem::create([
                    'request_id'   => $req->request_id,
                    'parameter_id' => $it['parameter_id'],
                    'notes'        => $it['notes'] ?? null,
                ]);
            }

            AuditLogger::write(
                'SAMPLE_REQUEST_SUBMITTED',
                null, // actor staff_id null (karena ini client portal)
                'sample_requests',
                $req->request_id,
                null,
                [
                    'client_id' => $req->client_id,
                    'status' => $req->request_status,
                    'items_count' => count($items),
                ]
            );

            $req->load(['items.parameter']);

            return response()->json(['data' => $req], 201);
        });
    }

    // PATCH /api/v1/sample-requests/{request}/status (approve/reject/reviewed/etc)
    public function updateStatus(SampleRequestStatusUpdateRequest $request, SampleRequest $sampleRequest)
    {
        $this->authorize('updateStatus', $sampleRequest);

        $old = $sampleRequest->request_status;
        $new = $request->input('status');

        $sampleRequest->request_status = $new;
        $sampleRequest->reviewed_by = $request->user()?->getKey();
        $sampleRequest->reviewed_at = now();
        $sampleRequest->save();

        AuditLogger::write(
            'SAMPLE_REQUEST_STATUS_UPDATED',
            $request->user()?->getKey(),
            'sample_requests',
            $sampleRequest->request_id,
            ['request_status' => $old],
            ['request_status' => $new, 'notes' => $request->input('notes')]
        );

        return response()->json(['data' => $sampleRequest]);
    }

    // PATCH /api/v1/sample-requests/{request}/handover (admin -> sample collector)
    public function handover(SampleRequestHandoverRequest $request, SampleRequest $sampleRequest)
    {
        $this->authorize('handover', $sampleRequest);

        $old = $sampleRequest->request_status;

        $sampleRequest->request_status = 'handed_over_to_collector';
        $sampleRequest->handed_over_by = $request->user()?->getKey();
        $sampleRequest->handed_over_at = now();
        $sampleRequest->save();

        AuditLogger::write(
            'SAMPLE_REQUEST_HANDOVER',
            $request->user()?->getKey(),
            'sample_requests',
            $sampleRequest->request_id,
            ['request_status' => $old],
            [
                'request_status' => $sampleRequest->request_status,
                'notes' => $request->input('notes'),
            ]
        );

        return response()->json(['data' => $sampleRequest]);
    }
}
