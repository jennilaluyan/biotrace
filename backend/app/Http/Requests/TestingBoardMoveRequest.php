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

            // optional
            'workflow_group' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string'],

            // ✅ NEW: finalize last stage (record exited_at without moving)
            'finalize' => ['nullable', 'boolean'],
        ];
    }
}
