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
            'method_of_analysis' => ['required', 'string', 'max:255'],
            'qc_payload' => ['required', 'array'],
        ];
    }
}
