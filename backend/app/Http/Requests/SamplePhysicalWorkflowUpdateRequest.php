<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SamplePhysicalWorkflowUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        // AuthZ detail (role/ordering) is enforced in controller + policy
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'action' => [
                'required',
                'string',
                'max:64',
                'in:admin_received_from_client,admin_brought_to_collector,collector_received,collector_intake_completed,collector_returned_to_admin,admin_received_from_collector,client_picked_up',
            ],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
