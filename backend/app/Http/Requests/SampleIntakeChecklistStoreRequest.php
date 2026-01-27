<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleIntakeChecklistStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role check di controller (tetap)
    }

    public function rules(): array
    {

        return [
            // accept either checks OR legacy checklist
            'checks' => ['nullable', 'array'],
            'checklist' => ['nullable', 'array'],

            // strict required keys for new payload
            'checks.sample_physical_condition' => ['required_without:checklist', 'boolean'],
            'checks.volume' => ['required_without:checklist', 'boolean'],
            'checks.identity' => ['required_without:checklist', 'boolean'],
            'checks.packing' => ['required_without:checklist', 'boolean'],
            'checks.supporting_documents' => ['required_without:checklist', 'boolean'],

            // legacy (fallback) – still allow boolean map if older UI sends it
            'checklist.*' => ['boolean'],

            // per-item notes (required if that item FAIL)
            'notes' => ['nullable', 'array'],
            'notes.sample_physical_condition' => ['nullable', 'string', 'max:500'],
            'notes.volume' => ['nullable', 'string', 'max:500'],
            'notes.identity' => ['nullable', 'string', 'max:500'],
            'notes.packing' => ['nullable', 'string', 'max:500'],
            'notes.supporting_documents' => ['nullable', 'string', 'max:500'],

            // general note
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($v) {
            $data = $this->all();

            // If new payload used: enforce fail -> reason required
            $checks = $data['checks'] ?? null;
            if (is_array($checks)) {
                $notes = is_array($data['notes'] ?? null) ? $data['notes'] : [];

                $map = [
                    'sample_physical_condition',
                    'volume',
                    'identity',
                    'packing',
                    'supporting_documents',
                ];

                foreach ($map as $k) {
                    if (!array_key_exists($k, $checks)) {
                        // required rules will catch, but keep safety
                        continue;
                    }
                    $passed = $checks[$k] === true;
                    if (!$passed) {
                        $reason = trim((string)($notes[$k] ?? ''));
                        if ($reason === '') {
                            $v->errors()->add("notes.$k", "Reason is required when '$k' is FAIL.");
                        }
                    }
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'checks.sample_physical_condition.required_without' => 'Sample Physical Condition is required.',
            'checks.volume.required_without' => 'Volume is required.',
            'checks.identity.required_without' => 'Identity is required.',
            'checks.packing.required_without' => 'Packing is required.',
            'checks.supporting_documents.required_without' => 'Supporting Documents is required.',
        ];
    }
}