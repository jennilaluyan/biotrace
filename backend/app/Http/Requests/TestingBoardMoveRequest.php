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
            'workflow_group' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string'],
            'finalize' => ['nullable', 'boolean'],
            'apply_to_batch' => ['nullable', 'boolean'],
        ];
    }
}
