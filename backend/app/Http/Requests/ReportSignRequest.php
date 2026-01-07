<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReportSignRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Authorization (role check) dilakukan di controller biar jelas role_code mapping-nya.
        return true;
    }

    public function rules(): array
    {
        return [
            'role_code' => ['required', 'string', 'max:32'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
