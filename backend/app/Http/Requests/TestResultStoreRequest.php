<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TestResultStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'value_raw'   => ['required', 'string'],
            'value_final' => ['nullable', 'string'],
            'unit_id'     => ['nullable', 'integer', Rule::exists('units', 'unit_id')],
            'flags'       => ['nullable', 'array'],
        ];
    }
}
