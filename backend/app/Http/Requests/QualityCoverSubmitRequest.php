<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QualityCoverSubmitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'parameter_id' => ['nullable', 'integer'],
            'parameter_label' => ['nullable', 'string', 'max:255'],
            'supporting_drive_url' => ['nullable', 'string', 'max:500', 'url'],
            'supporting_notes' => ['nullable', 'string', 'max:10000'],
            'method_of_analysis' => ['required', 'string', 'max:255'],
            'qc_payload' => ['required', 'array'],
        ];
    }
}
