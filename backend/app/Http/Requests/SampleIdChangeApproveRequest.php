<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleIdChangeApproveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
