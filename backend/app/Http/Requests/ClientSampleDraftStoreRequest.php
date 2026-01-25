<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ClientSampleDraftStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // controller enforce "harus Client"
    }

    public function rules(): array
    {
        return [
            // DB samples.sample_type masih NOT NULL -> tetap required
            'sample_type' => ['required', 'string', 'max:80'],

            // ✅ portal uses scheduled_delivery_at (optional on draft)
            'scheduled_delivery_at' => ['nullable', 'date'],

            'examination_purpose' => ['nullable', 'string', 'max:150'],
            'additional_notes' => ['nullable', 'string', 'max:5000'],

            // ✅ requested parameters (optional on draft)
            'parameter_ids' => ['nullable', 'array'],
            'parameter_ids.*' => ['integer', 'exists:parameters,parameter_id'],

            // ❌ removed: received_at, contact_history, priority, title/name, notes alias
        ];
    }
}