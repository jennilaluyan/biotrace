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
        $data = $request->validated([
            'staff_id' => ['required', 'integer', 'exists:staffs,staff_id'],

            'type' => ['required', 'in:individual,institution'],

            'name'  => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'string', 'max:150'],

            // Individual fields
            'national_id'       => ['nullable', 'string', 'max:50'],
            'date_of_birth'     => ['nullable', 'date'],
            'gender'            => ['nullable', 'string', 'max:10'],
            'address_ktp'       => ['nullable', 'string', 'max:255'],
            'address_domicile'  => ['nullable', 'string', 'max:255'],

            // Institutional fields
            'institution_name'      => ['nullable', 'string', 'max:200'],
            'institution_address'   => ['nullable', 'string', 'max:255'],
            'contact_person_name'   => ['nullable', 'string', 'max:150'],
            'contact_person_phone'  => ['nullable', 'string', 'max:30'],
            'contact_person_email'  => ['nullable', 'string', 'max:150'],
        ]);

        $data['staff_id'] = $request->user()->staff_id;

        $client = Client::create($data);

        return response()->json($client, 201);
    }
}
