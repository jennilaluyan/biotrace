<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QcRunStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Route middleware EnsureStaff sudah handle.
        return true;
    }

    public function rules(): array
    {
        return [
            'qc_control_id' => ['required', 'integer', 'min:1'],
            'value' => ['required', 'numeric'],
        ];
    }
}
