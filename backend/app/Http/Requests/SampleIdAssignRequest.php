<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleIdAssignRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'sample_id' => ['nullable', 'string', 'max:20', 'regex:/^[A-Za-z]{1,5}\s+\d{1,6}$/'],
        ];
    }
}
