<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TestResultStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // RBAC tetap dicek di controller/policy
    }

    public function rules(): array
    {
        return [
            'value_raw'   => ['required', 'string', 'max:2000'],
            'value_final' => ['nullable', 'string', 'max:2000'],
            'unit_id'     => ['nullable', 'integer', 'exists:units,unit_id'],
            'flags'       => ['nullable', 'array'],
        ];
    }
}
