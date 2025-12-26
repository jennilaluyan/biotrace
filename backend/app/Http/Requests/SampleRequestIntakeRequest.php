<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleRequestIntakeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // nanti kalau policy intake sudah siap, boleh diganti
    }

    protected function prepareForValidation(): void
    {
        // allow alias: intake_result -> result
        if (!$this->has('result') && $this->has('intake_result')) {
            $this->merge([
                'result' => $this->input('intake_result'),
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'result' => ['required', 'in:pass,fail'],
            'received_at' => ['nullable', 'date'], // dipakai saat pass
            'intake_notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
