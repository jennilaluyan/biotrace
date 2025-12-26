<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleRequestStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'intended_sample_type' => ['nullable', 'string', 'max:100'],
            'examination_purpose'  => ['nullable', 'string', 'max:255'],
            'contact_history'      => ['nullable', 'string', 'max:50'],
            'priority'             => ['nullable', 'string', 'max:30'],
            'additional_notes'     => ['nullable', 'string', 'max:500'],

            'items'                => ['required', 'array', 'min:1'],
            'items.*.parameter_id' => ['required', 'integer', 'exists:parameters,parameter_id'],
            'items.*.notes'        => ['nullable', 'string', 'max:255'],
        ];
    }
}
