<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ParameterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $routeParam = $this->route('parameter');
        $parameterId = is_object($routeParam) ? ($routeParam->parameter_id ?? null) : $routeParam;

        $isCreate = $this->isMethod('post');

        $codeRule = Rule::unique('parameters', 'code')->ignore($parameterId, 'parameter_id');

        return [
            'code' => [
                $isCreate ? 'required' : 'sometimes',
                'string',
                'max:40',
                $codeRule,
            ],

            'name' => [
                $isCreate ? 'required' : 'sometimes',
                'string',
                'max:150',
            ],

            'workflow_group' => [
                'sometimes',
                'nullable',
                'string',
                'max:20',
                Rule::in(['pcr', 'sequencing', 'rapid', 'microbiology']),
            ],

            'unit' => [
                $isCreate ? 'required' : 'sometimes',
                'string',
                'max:40',
            ],

            'unit_id' => [
                'sometimes',
                'nullable',
                'integer',
                'exists:units,unit_id',
            ],

            'method_ref' => [
                $isCreate ? 'required' : 'sometimes',
                'string',
                'max:120',
            ],

            'status' => [
                $isCreate ? 'required' : 'sometimes',
                Rule::in(['Active', 'Inactive']),
            ],

            'tag' => [
                $isCreate ? 'required' : 'sometimes',
                Rule::in(['Routine', 'Research']),
            ],
        ];
    }

    protected function prepareForValidation(): void
    {
        $trim = fn($v) => is_string($v) ? trim($v) : $v;

        $this->merge([
            'code' => $trim($this->input('code')),
            'name' => $trim($this->input('name')),
            'unit' => $trim($this->input('unit')),
            'method_ref' => $trim($this->input('method_ref')),
        ]);

        if ($this->has('workflow_group')) {
            $this->merge([
                'workflow_group' => strtolower(trim((string) $this->input('workflow_group'))),
            ]);
        }
    }

    public function messages(): array
    {
        return [
            'code.unique' => 'Code already exists. Please use another code.',
            'workflow_group.in' => 'Workflow group must be one of: pcr, sequencing, rapid, microbiology.',
            'status.in' => 'Status must be Active or Inactive.',
            'tag.in' => 'Tag must be Routine or Research.',
        ];
    }
}
