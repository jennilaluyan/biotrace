<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleCustodyEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Role enforcement is in policy via controller ->authorize(...)
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'event_key' => [
                'required',
                'string',
                'in:admin_received_from_client,admin_brought_to_collector,collector_received,collector_intake_completed,collector_returned_to_admin,admin_received_from_collector,client_picked_up',
            ],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'event_key.required' => 'event_key is required.',
            'event_key.in' => 'Invalid event_key.',
        ];
    }
}
