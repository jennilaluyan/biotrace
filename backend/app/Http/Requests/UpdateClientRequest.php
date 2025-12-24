<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'type' => ['sometimes', 'in:individual,institution'],

            'name'  => ['sometimes', 'string', 'max:150'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'email' => ['sometimes', 'nullable', 'email', 'max:150'],

            'national_id'       => ['sometimes', 'nullable', 'string', 'max:50'],
            'date_of_birth'     => ['sometimes', 'nullable', 'date'],
            'gender'            => ['sometimes', 'nullable', 'string', 'max:10'],
            'address_ktp'       => ['sometimes', 'nullable', 'string', 'max:255'],
            'address_domicile'  => ['sometimes', 'nullable', 'string', 'max:255'],

            'institution_name'      => ['sometimes', 'nullable', 'string', 'max:200'],
            'institution_address'   => ['sometimes', 'nullable', 'string', 'max:255'],
            'contact_person_name'   => ['sometimes', 'nullable', 'string', 'max:150'],
            'contact_person_phone'  => ['sometimes', 'nullable', 'string', 'max:30'],
            'contact_person_email'  => ['sometimes', 'nullable', 'email', 'max:150'],
        ];
    }
}
