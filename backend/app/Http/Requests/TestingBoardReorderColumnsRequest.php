<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TestingBoardReorderColumnsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'column_ids' => ['required', 'array', 'min:1'],
            'column_ids.*' => ['integer', 'min:1'],
        ];
    }
}
