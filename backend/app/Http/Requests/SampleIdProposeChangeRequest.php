<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleIdProposeChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'proposed_sample_id' => ['required', 'string', 'max:20'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
