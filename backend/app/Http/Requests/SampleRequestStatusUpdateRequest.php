<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use App\Support\SampleRequestStatusTransitions;

class SampleRequestStatusUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $all = SampleRequestStatusTransitions::allStatuses();
        $in = is_array($all) && count($all) ? 'in:' . implode(',', $all) : null;

        return array_filter([
            'action' => ['nullable', 'string', 'in:accept,approve,reject,return,received'],
            'request_status' => ['nullable', 'string', $in],

            'note' => ['nullable', 'string', 'max:500'],

            // accept can use either id or name
            'test_method_id' => ['nullable', 'integer', 'min:1'],
            'method_id' => ['nullable', 'integer', 'min:1'],
            'test_method_name' => ['nullable', 'string', 'max:255'],
            'method_name' => ['nullable', 'string', 'max:255'],
        ]);
    }
}