<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ClientSampleSubmitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sample_type' => ['required', 'string', 'max:80'],

            // ✅ REQUIRED on submit
            'scheduled_delivery_at' => ['required', 'date'],

            // ✅ REQUIRED on submit
            'parameter_ids' => ['required', 'array', 'min:1'],
            'parameter_ids.*' => ['integer', 'exists:parameters,parameter_id'],

            'examination_purpose' => ['nullable', 'string', 'max:150'],
            'additional_notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}