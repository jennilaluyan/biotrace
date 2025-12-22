<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleCommentStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'min:2', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Comment body is required.',
            'body.min' => 'Comment is too short.',
            'body.max' => 'Comment is too long (max 1000).',
        ];
    }
}