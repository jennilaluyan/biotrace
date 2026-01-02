<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TestResultUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'value_raw'   => ['sometimes', 'string'],
            'value_final' => ['sometimes', 'nullable', 'string'],
            'unit_id'     => ['sometimes', 'nullable', 'integer', Rule::exists('units', 'unit_id')],
            'flags'       => ['sometimes', 'nullable', 'array'],
        ];
    }
}
