<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        // RBAC di-handle di policy SamplePolicy.
        // Di sini cukup true, yang penting user sudah ter-auth.
        return true;
    }

    public function rules(): array
    {
        return [
            'client_id' => [
                'required',
                'integer',
                'exists:clients,client_id',
            ],

            'received_at' => [
                'required',
                'date', // kalau mau lebih ketat: date_format:Y-m-d H:i
            ],

            'sample_type' => [
                'required',
                'string',
                'max:80',
            ],

            'examination_purpose' => [
                'nullable',
                'string',
                'max:150',
            ],

            'contact_history' => [
                'nullable',
                'string',
                'in:ada,tidak,tidak_tahu',
            ],

            'priority' => [
                'nullable',
                'integer',
                'min:0',
                'max:5',
            ],

            'additional_notes' => [
                'nullable',
                'string',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'client_id.required' => 'Client wajib dipilih.',
            'client_id.exists'   => 'Client tidak ditemukan di database.',

            'received_at.required' => 'Tanggal penerimaan sampel wajib diisi.',
            'received_at.date'     => 'Format tanggal penerimaan sampel tidak valid.',

            'sample_type.required' => 'Jenis sampel wajib diisi.',

            'contact_history.in' => 'Riwayat kontak hanya boleh: ada, tidak, atau tidak_tahu.',

            'priority.integer' => 'Prioritas harus berupa angka.',
            'priority.min'     => 'Prioritas minimal 0.',
            'priority.max'     => 'Prioritas maksimal 5.',
        ];
    }
}
