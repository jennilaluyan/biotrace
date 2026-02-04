<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TestingBoardMoveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sample_id' => ['required', 'integer', 'min:1'],
            'to_column_id' => ['required', 'integer', 'min:1'],

            // allow FE to pass selected workflow group (optional)
            'workflow_group' => ['nullable', 'string', 'regex:/^[a-z0-9_]+$/'],
        ];
    }
}
