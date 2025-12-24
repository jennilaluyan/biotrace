<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use App\Support\SampleStatusTransitions;

class SampleStatusUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Di sini cukup pastikan user sudah login.
        // Cek detail per-role dilakukan di controller via SampleStatusTransitions.
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'target_status' => [
                'required',
                'string',
                'in:' . implode(',', SampleStatusTransitions::allStatuses()),
            ],
            'note' => [
                'nullable',
                'string',
                'max:500',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'target_status.required' => 'Status baru wajib dipilih.',
            'target_status.in'       => 'Status baru tidak dikenal.',
        ];
    }
}
