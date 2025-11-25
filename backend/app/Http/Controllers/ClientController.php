<?php

namespace App\Http\Controllers;

use App\Models\Client;
use Illuminate\Http\Request;
use App\Http\Requests\StoreClientRequest;
use App\Http\Requests\UpdateClientRequest;
use App\Support\ApiResponse;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Client::class);

        $query = Client::query()->orderByDesc('client_id');

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', '%' . $search . '%')
                    ->orWhere('institution_name', 'ilike', '%' . $search . '%')
                    ->orWhere('email', 'ilike', '%' . $search . '%')
                    ->orWhere('contact_person_name', 'ilike', '%' . $search . '%');
            });
        }

        $clients = $query->get();

        return ApiResponse::success(
            data: $clients,
            message: 'Clients fetched successfully.',
            status: 200,
            extra: [
                'resource' => 'clients',
                'meta' => [
                    'total'  => $clients->count(),
                    'search' => $search,
                ],
            ],
        );
    }

    public function show(Client $client)
    {
        $this->authorize('view', $client);

        return ApiResponse::success(
            data: $client,
            message: 'Client fetched successfully.',
            status: 200,
            extra: ['resource' => 'clients'],
        );
    }

    public function store(StoreClientRequest $request)
    {
        $this->authorize('create', Client::class);

        $data = $request->validated();
        $data['staff_id'] = $request->user()->staff_id;

        $client = Client::create($data);

        return ApiResponse::success(
            data: $client,
            message: 'Client created successfully.',
            status: 201,
            extra: ['resource' => 'clients'],
        );
    }

    public function update(UpdateClientRequest $request, Client $client)
    {
        $this->authorize('update', $client);

        $data = $request->validated();
        $client->update($data);

        return ApiResponse::success(
            data: $client,
            message: 'Client updated successfully.',
            status: 200,
            extra: ['resource' => 'clients'],
        );
    }

    public function destroy(Client $client)
    {
        $this->authorize('delete', $client);

        $client->delete(); // soft delete sudah diatur di model + migration

        return ApiResponse::success(
            data: null,
            message: 'Client deactivated successfully.',
            status: 200,
            extra: ['resource' => 'clients'],
        );
    }
}
