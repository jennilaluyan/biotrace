<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleCrosscheckSubmitRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Authorization kita handle di controller (role analyst only).
        return true;
    }

    public function rules(): array
    {
        return [
            // Jawaban kamu: cukup non-empty
            'physical_label_code' => ['required', 'string', 'min:1'],
            // note hanya wajib saat mismatch (failed) → kita enforce di controller karena perlu compare
            'note' => ['nullable', 'string'],
        ];
    }
}