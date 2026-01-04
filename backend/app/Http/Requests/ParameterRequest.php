<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ParameterRequest extends FormRequest
{
    public function authorize(): bool
    {
        // authz final tetap di Policy via controller authorize()
        return true;
    }

    public function rules(): array
    {
        // untuk ignore unique saat update
        $parameterId = $this->route('parameter')?->parameter_id
            ?? $this->route('parameter');

        return [
            'code' => [
                'required',
                'string',
                'max:40',
                Rule::unique('parameters', 'code')->ignore($parameterId, 'parameter_id'),
            ],
            'name' => ['required', 'string', 'max:150'],

            'unit' => ['nullable', 'string', 'max:40'],
            'unit_id' => ['nullable', 'integer', 'exists:units,unit_id'],

            'method_ref' => ['nullable', 'string', 'max:120'],

            // sesuai DB CHECK constraint
            'status' => ['required', Rule::in(['Active', 'Inactive'])],
            'tag' => ['required', Rule::in(['Routine', 'Research'])],
        ];
    }

    public function messages(): array
    {
        return [
            'code.unique' => 'Code already exists. Please use another code.',
            'status.in' => 'Status must be Active or Inactive.',
            'tag.in' => 'Tag must be Routine or Research.',
        ];
    }
}
