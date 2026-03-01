<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ParameterRequestStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        // final authz done by Policy in controller
        return true;
    }

    public function rules(): array
    {
        return [
            'parameter_name' => ['required', 'string', 'max:150'],
            'category' => [
                'sometimes',
                'string',
                Rule::in(['pcr', 'sequencing', 'rapid', 'microbiology']),
            ],
            'reason' => ['nullable', 'string', 'max:10000'],
        ];
    }

    public function messages(): array
    {
        return [
            'parameter_name.required' => 'Parameter name is required.',
            'category.in' => 'Category must be one of: pcr, sequencing, rapid, microbiology.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('category')) {
            $this->merge([
                'category' => strtolower(trim((string) $this->input('category'))),
            ]);
        }
    }
}