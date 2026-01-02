<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleTestsBulkStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // authorisasi kita lakukan di Controller via Policy/Gate
    }

    public function rules(): array
    {
        return [
            'tests' => ['required', 'array', 'min:1', 'max:200'], // batas biar aman
            'tests.*.parameter_id' => ['required', 'integer', 'min:1'],
            'tests.*.method_id' => ['nullable', 'integer', 'min:1'],
            'tests.*.assigned_to' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'tests.max' => 'Max 200 tests per request (memory-safe limit).',
        ];
    }
}
