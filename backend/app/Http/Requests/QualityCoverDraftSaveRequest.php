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
            'parameter_id' => ['nullable', 'integer'],
            'parameter_label' => ['nullable', 'string', 'max:255'],

            'method_of_analysis' => ['nullable', 'string', 'max:255'],
            'qc_payload' => ['nullable', 'array'],
            'qc_payload.*' => ['nullable'],
        ];
    }
}
