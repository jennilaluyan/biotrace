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
        return [
            'sample_type' => ['sometimes', 'required', 'string', 'max:80'],
            'scheduled_delivery_at' => ['sometimes', 'nullable', 'date'],
            'examination_purpose' => ['sometimes', 'nullable', 'string', 'max:150'],
            'additional_notes' => ['sometimes', 'nullable', 'string', 'max:5000'],

            'parameter_ids' => ['sometimes', 'nullable', 'array'],
            'parameter_ids.*' => ['integer', 'exists:parameters,parameter_id'],
        ];
    }
}