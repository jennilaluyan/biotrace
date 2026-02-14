<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DocumentTemplateUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'record_no_prefix' => ['sometimes', 'string', 'max:200'],
            'form_code_prefix' => ['sometimes', 'string', 'max:250'],
            'revision_no' => ['sometimes', 'integer', 'min:0', 'max:99'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}