<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TestingBoardMoveRequest extends FormRequest
{
    public function authorize(): bool
    {
        // auth middleware already guards; allow here
        return true;
    }

    public function rules(): array
    {
        return [
            'sample_id' => ['required', 'integer', 'min:1'],
            'to_column_id' => ['required', 'integer', 'min:1'],
        ];
    }
}
