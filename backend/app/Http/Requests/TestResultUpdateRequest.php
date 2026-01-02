<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TestResultUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'value_raw'   => ['sometimes', 'nullable', 'string', 'max:2000'],
            'value_final' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'unit_id'     => ['sometimes', 'nullable', 'integer', 'exists:units,unit_id'],
            'flags'       => ['sometimes', 'nullable', 'array'],
        ];
    }
}
