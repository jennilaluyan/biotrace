<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleVerifyRequest extends FormRequest
{
    public function authorize(): bool
    {
        // role enforcement ada di policy (controller -> authorize)
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'note.max' => 'Note terlalu panjang (maks 500 karakter).',
        ];
    }
}
