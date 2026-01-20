<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleIntakeChecklistStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role check dilakukan di controller (biar konsisten dengan code kamu)
    }

    public function rules(): array
    {
        return [
            'checklist' => ['required', 'array', 'min:1'],
            'checklist.*' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'checklist.required' => 'Checklist is required.',
            'checklist.array' => 'Checklist must be an object/array.',
            'checklist.min' => 'Checklist must contain at least one item.',
            'checklist.*.boolean' => 'Each checklist item must be boolean.',
        ];
    }
}
