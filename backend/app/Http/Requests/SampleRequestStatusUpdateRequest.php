<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use App\Support\SampleRequestStatusTransitions;

class SampleRequestStatusUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'target_status' => [
                'required',
                'string',
                'in:' . implode(',', SampleRequestStatusTransitions::allStatuses()),
            ],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
