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
            'parameter_id' => ['sometimes', 'integer', 'exists:parameters,parameter_id'],

            // create flow
            'parameter_name' => ['required_without:parameter_id', 'string', 'max:150'],

            // shared
            'category' => ['sometimes', 'string', Rule::in(['pcr', 'sequencing', 'rapid', 'microbiology'])],
            'reason' => ['nullable', 'string', 'max:10000'],

            // update flow (fields being requested to change)
            'name' => ['sometimes', 'string', 'max:150'],
            'workflow_group' => ['sometimes', 'nullable', 'string', Rule::in(['pcr', 'sequencing', 'rapid', 'microbiology'])],
            'status' => ['sometimes', Rule::in(['Active', 'Inactive'])],
            'tag' => ['sometimes', Rule::in(['Routine', 'Research'])],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('category')) {
            $this->merge(['category' => strtolower(trim((string) $this->input('category')))]);
        }
        if ($this->has('workflow_group')) {
            $wg = strtolower(trim((string) $this->input('workflow_group')));
            $this->merge(['workflow_group' => $wg !== '' ? $wg : null]);
        }
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $isUpdate = $this->filled('parameter_id');

            if ($isUpdate) {
                $hasAnyChange = $this->hasAny(['name', 'workflow_group', 'status', 'tag']);
                if (!$hasAnyChange) {
                    $v->errors()->add('parameter_id', 'At least one field must be provided for update request.');
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'parameter_name.required' => 'Parameter name is required.',
            'category.in' => 'Category must be one of: pcr, sequencing, rapid, microbiology.',
        ];
    }
}
