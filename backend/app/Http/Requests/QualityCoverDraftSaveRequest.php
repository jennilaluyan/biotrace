<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QualityCoverDraftSaveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role check done in controller (consistent with other modules in your codebase)
    }

    public function rules(): array
    {
        return [
            // manual field
            'method_of_analysis' => ['nullable', 'string', 'max:255'],

            // group-aware qc payload (stored as JSON)
            'qc_payload' => ['nullable', 'array'],

            // allow nested payload freely (draft stage)
            'qc_payload.*' => ['nullable'],
        ];
    }
}
