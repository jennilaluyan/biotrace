<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReagentCalcApproveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'approved' => ['required', 'boolean'],
            'notes'    => ['nullable', 'string'],
        ];
    }
}