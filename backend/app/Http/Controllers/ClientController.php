<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use App\Http\Requests\StoreClientRequest;
use App\Http\Requests\UpdateClientRequest;


class ClientController extends Controller
{
    /**
     * GET /api/v1/clients
     *
     * List semua client (sementara tanpa pagination dulu).
     * Bisa kamu tambahkan filter/search nanti.
     */
    public function index(Request $request)
    {
        $query = Client::query()
            ->orderByDesc('client_id');

        // Optional simple search: ?search=...
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', '%' . $search . '%')
                    ->orWhere('institution_name', 'ilike', '%' . $search . '%')
                    ->orWhere('email', 'ilike', '%' . $search . '%')
                    ->orWhere('contact_person_name', 'ilike', '%' . $search . '%');
            });
        }

        $clients = $query->get();

        return response()->json($clients);
    }

    /**
     * GET /api/v1/clients/{client}
     *
     * Detail satu client.
     *
     * NOTE:
     * Pastikan di model Client sudah:
     *   protected $primaryKey = 'client_id';
     */
    public function show(Client $client)
    {
        return response()->json($client);
    }

    /**
     * POST /api/v1/clients
     *
     * Buat client baru (individual atau institution).
     *
     * Validasi disesuaikan dengan migration clients table.
     */
    public function store(StoreClientRequest $request)
    {
        $data = $request->validated();
        $data['staff_id'] = $request->user()->staff_id;

        $client = Client::create($data);

        return response()->json([
            'data'    => $client,
            'message' => 'Client created successfully.',
        ], 201);
    }

    public function update(UpdateClientRequest $request, Client $client)
    {
        $data = $request->validated();

        $client->update($data);

        return response()->json([
            'data'    => $client,
            'message' => 'Client updated successfully.',
        ], 200);
    }

    public function destroy(Client $client)
    {
        // Soft delete (isi deleted_at), bukan hard delete
        $client->delete();

        return response()->json([
            'message' => 'Client deleted (soft) successfully.',
        ], 200);
    }
}
