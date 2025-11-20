<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\Request;

class SampleController extends Controller
{
    /**
     * GET /api/v1/samples
     *
     * List semua sample.
     * Bisa di-filter via ?status=received&client_id=1
     */
    public function index(Request $request)
    {
        $query = Sample::query()
            ->orderByDesc('sample_id');

        if ($status = $request->query('status')) {
            $query->where('current_status', $status);
        }

        if ($clientId = $request->query('client_id')) {
            $query->where('client_id', $clientId);
        }

        $samples = $query->get();

        return response()->json($samples);
    }

    /**
     * GET /api/v1/samples/{sample}
     */
    public function show(Sample $sample)
    {
        return response()->json($sample);
    }

    /**
     * POST /api/v1/samples
     *
     * Buat sample baru.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id'           => ['required', 'integer', 'exists:clients,client_id'],
            'received_at'         => ['required', 'date'],
            'sample_type'         => ['required', 'string', 'max:80'],
            'examination_purpose' => ['nullable', 'string', 'max:150'],
            'contact_history'     => ['nullable', 'in:ada,tidak,tidak_tahu'],
            'priority'            => ['nullable', 'integer'],
            'current_status'      => [
                'required',
                'in:received,in_progress,testing_completed,verified,validated,reported',
            ],
            'additional_notes'    => ['nullable', 'string'],
            'created_by'          => ['required', 'integer', 'exists:staffs,staff_id'],
        ]);

        $sample = Sample::create($data);

        return response()->json($sample, 201);
    }
}
