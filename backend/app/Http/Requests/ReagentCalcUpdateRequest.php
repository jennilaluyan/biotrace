<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReagentCalcUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role-check di controller (biar konsisten dengan modul kamu)
    }

    public function rules(): array
    {
        return [
            // payload proposal (json) -> wajib ada minimal object/array
            'payload' => ['required', 'array'],
            'notes'   => ['nullable', 'string'],
        ];
    }
}