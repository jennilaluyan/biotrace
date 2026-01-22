<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ClientSampleSubmitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Submit: wajib minimal ini (sesuaikan SRD kamu kalau required-nya beda).
        return [
            'sample_type' => ['required', 'string', 'max:80'],
            'received_at' => ['required', 'date'],

            // sisanya optional tapi tervalidasi kalau ada
            'notes'             => ['nullable', 'string', 'max:5000'],
            'examination_purpose' => ['nullable', 'string', 'max:120'],
            'contact_history'   => ['nullable', 'in:ada,tidak,tidak_tahu'],
            'priority'          => ['nullable', 'integer', 'min:0', 'max:5'],
            'additional_notes'  => ['nullable', 'string', 'max:5000'],
        ];
    }
}
