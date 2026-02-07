<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TestingBoardAddColumnRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // policy/role check di controller
    }

    public function rules(): array
    {
        return [
            'workflow_group' => ['required', 'string', 'max:50'],
            'name' => ['required', 'string', 'max:120'],

            // legacy
            'position' => ['nullable', 'integer', 'min:0'],

            // new
            'relative_to_column_id' => ['nullable', 'integer', 'exists:testing_columns,column_id'],
            'side' => ['nullable', Rule::in(['left', 'right'])],
        ];
    }
}
