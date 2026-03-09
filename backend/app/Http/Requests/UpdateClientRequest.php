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
            'name' => ['sometimes', 'nullable', 'string', 'max:150'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'email' => ['sometimes', 'required', 'email', 'max:150'],

            'national_id' => ['sometimes', 'nullable', 'string', 'max:50'],
            'date_of_birth' => ['sometimes', 'nullable', 'date'],
            'gender' => ['sometimes', 'nullable', 'string', 'max:10'],
            'address_ktp' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address_domicile' => ['sometimes', 'nullable', 'string', 'max:255'],

            'institution_name' => ['sometimes', 'required_if:type,institution', 'string', 'max:200'],
            'institution_address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'contact_person_name' => ['sometimes', 'required_if:type,institution', 'string', 'max:150'],
            'contact_person_phone' => ['sometimes', 'required_if:type,institution', 'string', 'max:30'],
            'contact_person_email' => ['sometimes', 'required_if:type,institution', 'email', 'max:150'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $type = $this->input('type', $this->route('client')?->type);

        if ($type !== 'institution') {
            return;
        }

        $payload = [];

        if ($this->has('institution_name')) {
            $institutionName = trim((string) $this->input('institution_name', ''));
            $payload['name'] = $institutionName !== '' ? $institutionName : null;
        }

        if ($this->has('contact_person_phone')) {
            $contactPhone = trim((string) $this->input('contact_person_phone', ''));
            $payload['phone'] = $contactPhone !== '' ? $contactPhone : null;
        }

        if ($payload !== []) {
            $this->merge($payload);
        }
    }
}
