<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SamplePhysicalWorkflowUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Role enforcement is in policy via controller ->authorize(...)
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'action' => [
                'required',
                'string',
                Rule::in([
                    // request/intake flow (existing)
                    'admin_received_from_client',
                    'admin_brought_to_collector',
                    'collector_received',
                    'collector_intake_completed',
                    'collector_returned_to_admin',
                    'admin_received_from_collector',
                    'client_picked_up',

                    // SC -> Analyst handoff (todo 1)
                    'sc_delivered_to_analyst',
                    'analyst_received',

                    // Analyst crosscheck FAIL -> return to SC (todo 2 addition)
                    'analyst_returned_to_sc',
                    'sc_received_from_analyst',
                ]),
            ],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'action.required' => 'Action is required.',
            'action.in'       => 'Invalid action.',
        ];
    }
}