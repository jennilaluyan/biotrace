<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * ParameterRequestStoreRequest
 *
 * Validates payload for:
 * - create parameter request (parameter_name, category, reason)
 * - update parameter request (parameter_id + proposed field changes)
 *
 * Authorization is handled at controller via Policies.
 */
class ParameterRequestStoreRequest extends FormRequest
{
    private const WORKFLOW_GROUPS = ['pcr', 'sequencing', 'rapid', 'microbiology'];
    private const PARAMETER_TAGS = ['Routine', 'Research'];
    private const PARAMETER_STATUSES = ['Active', 'Inactive'];

    public function authorize(): bool
    {
        // Final authorization must be performed by Policies in controller.
        return true;
    }

    public function rules(): array
    {
        return [
            // If present => update request
            'parameter_id' => ['sometimes', 'integer', 'min:1', 'exists:parameters,parameter_id'],

            // Create flow
            'parameter_name' => ['required_without:parameter_id', 'string', 'max:150'],

            // Shared
            'category' => ['sometimes', 'string', Rule::in(self::WORKFLOW_GROUPS)],
            'reason' => ['nullable', 'string', 'max:10000'],

            // Update flow (proposed changes)
            'name' => ['sometimes', 'string', 'max:150'],
            'workflow_group' => ['sometimes', 'nullable', 'string', Rule::in(self::WORKFLOW_GROUPS)],
            'status' => ['sometimes', Rule::in(self::PARAMETER_STATUSES)],
            'tag' => ['sometimes', Rule::in(self::PARAMETER_TAGS)],
        ];
    }

    protected function prepareForValidation(): void
    {
        $trimIfPresent = function (string $key): void {
            if (!$this->has($key)) return;
            $this->merge([$key => trim((string) $this->input($key))]);
        };

        $trimIfPresent('parameter_name');
        $trimIfPresent('name');
        $trimIfPresent('reason');

        if ($this->has('category')) {
            $this->merge([
                'category' => strtolower(trim((string) $this->input('category'))),
            ]);
        }

        if ($this->has('workflow_group')) {
            $wg = strtolower(trim((string) $this->input('workflow_group')));
            $this->merge([
                // Allow clearing via empty string => null
                'workflow_group' => $wg !== '' ? $wg : null,
            ]);
        }
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $isUpdate = $this->filled('parameter_id');

            if ($isUpdate) {
                // For update request: must propose at least one field change
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
            'parameter_name.required_without' => 'Parameter name is required.',
            'category.in' => 'Category must be one of: pcr, sequencing, rapid, microbiology.',
            'workflow_group.in' => 'Workflow group must be one of: pcr, sequencing, rapid, microbiology.',
            'status.in' => 'Status must be Active or Inactive.',
            'tag.in' => 'Tag must be Routine or Research.',
        ];
    }
}
