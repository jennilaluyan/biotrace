<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DocumentTemplateUploadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // RBAC di controller (biar satu pintu)
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimetypes:application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'max:20480'],
            // 20MB max (ubah kalau perlu)
        ];
    }
}