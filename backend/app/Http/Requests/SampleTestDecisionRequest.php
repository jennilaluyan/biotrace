<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleTestDecisionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // policy di controller
    }

    public function rules(): array
    {
        return [
            'decision' => ['required', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
