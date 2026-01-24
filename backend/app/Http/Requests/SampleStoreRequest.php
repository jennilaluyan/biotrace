<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalize received_at so naive inputs are treated as LAB local time.
     * Accepts:
     * - "YYYY-MM-DDTHH:mm" (datetime-local) -> "YYYY-MM-DDTHH:mm:00+08:00/+07:00"
     * - "YYYY-MM-DDTHH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss+08:00/+07:00"
     * - already has Z / +HH:MM -> keep
     */
    protected function prepareForValidation(): void
    {
        $ra = $this->input('received_at');
        if (!is_string($ra)) return;
        $ra = trim($ra);
        if ($ra === '') return;

        // Fix common typo: "T11.32" -> "T11:32"
        $ra = str_replace('.', ':', $ra);

        // Already has timezone suffix? Keep as-is
        if (preg_match('/([+-]\d{2}:\d{2}|Z)$/i', $ra)) {
            $this->merge(['received_at' => $ra]);
            return;
        }

        $appTz = config('app.timezone', 'Asia/Makassar');
        $offset = ($appTz === 'Asia/Jakarta') ? '+07:00' : '+08:00';

        // datetime-local "YYYY-MM-DDTHH:mm"
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $ra)) {
            $this->merge(['received_at' => $ra . ':00' . $offset]);
            return;
        }

        // "YYYY-MM-DDTHH:mm:ss"
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $ra)) {
            $this->merge(['received_at' => $ra . $offset]);
            return;
        }

        $this->merge(['received_at' => $ra]);
    }

    public function rules(): array
    {
        return [
            'client_id' => ['required', 'integer', 'exists:clients,client_id'],
            'received_at' => ['required', 'date'],
            'sample_type' => ['required', 'string', 'max:80'],
            'examination_purpose' => ['nullable', 'string', 'max:150'],
            'assigned_to' => ['nullable', 'integer', 'exists:staffs,staff_id'],
            'additional_notes' => ['nullable', 'string'],

            // ✅ Required: at least 1 parameter selected
            'parameter_ids' => ['required', 'array', 'min:1'],
            'parameter_ids.*' => ['integer', 'exists:parameters,parameter_id'],

            // ❌ removed: contact_history, priority
        ];
    }

    public function messages(): array
    {
        return [
            'client_id.required' => 'Client wajib dipilih.',
            'client_id.exists' => 'Client tidak ditemukan di database.',
            'received_at.required' => 'Tanggal penerimaan sampel wajib diisi.',
            'received_at.date' => 'Format tanggal penerimaan sampel tidak valid.',
            'sample_type.required' => 'Jenis sampel wajib diisi.',
            'assigned_to.integer' => 'Assignee harus berupa angka (staff_id).',
            'assigned_to.exists' => 'Assignee tidak ditemukan di database.',

            'parameter_ids.required' => 'Minimal 1 parameter uji wajib dipilih.',
            'parameter_ids.array' => 'Parameter uji harus berupa list.',
            'parameter_ids.min' => 'Minimal 1 parameter uji wajib dipilih.',
        ];
    }
}