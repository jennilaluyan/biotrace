<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ClientSampleDraftUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Update draft/returned: field opsional (patch).
        return [
            'notes'             => ['sometimes', 'nullable', 'string', 'max:5000'],
            'sample_type'       => ['sometimes', 'nullable', 'string', 'max:80'],
            'received_at'       => ['sometimes', 'nullable', 'date'],
            'examination_purpose' => ['sometimes', 'nullable', 'string', 'max:120'],
            'contact_history'   => ['sometimes', 'nullable', 'in:ada,tidak,tidak_tahu'],
            'priority'          => ['sometimes', 'nullable', 'integer', 'min:0', 'max:5'],
            'additional_notes'  => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }
}
