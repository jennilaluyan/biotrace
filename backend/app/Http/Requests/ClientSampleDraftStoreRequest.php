<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ClientSampleDraftStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // controller yang enforce "harus Client"
    }

    public function rules(): array
    {
        // Draft: boleh minimal (contoh: notes). Field lain opsional dulu.
        return [
            'notes'               => ['nullable', 'string', 'max:5000'],

            // wajib karena DB NOT NULL
            'sample_type'         => ['required', 'string', 'max:80'],

            // kalau kolom received_at di DB juga NOT NULL, jadikan required juga
            'received_at'         => ['nullable', 'date'],

            'examination_purpose' => ['nullable', 'string', 'max:120'],
            'contact_history'     => ['nullable', 'in:ada,tidak,tidak_tahu'],
            'priority'            => ['nullable', 'integer', 'min:0', 'max:5'],
            'additional_notes'    => ['nullable', 'string', 'max:5000'],
        ];
    }
}
