<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Schema;

class StoreClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        // cuma user login yang boleh
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $payload = [];

        $email = $this->input('email');
        if (is_string($email)) {
            $email = trim($email);

            if ($email === '') {
                $payload['email'] = null;
                $payload['email_ci'] = null;
            } else {
                $payload['email'] = $email;

                if (Schema::hasColumn('clients', 'email_ci')) {
                    $payload['email_ci'] = mb_strtolower($email);
                }
            }
        }

        if ($this->input('type') === 'institution') {
            $institutionName = trim((string) $this->input('institution_name', ''));
            $contactPhone = trim((string) $this->input('contact_person_phone', ''));

            $payload['name'] = $institutionName !== '' ? $institutionName : null;
            $payload['phone'] = $contactPhone !== '' ? $contactPhone : null;
        }

        if ($payload !== []) {
            $this->merge($payload);
        }
    }

    public function rules(): array
    {
        $rules = [
            'type' => ['required', 'in:individual,institution'],
            'name' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'email', 'max:150'],

            'national_id' => ['nullable', 'string', 'max:50'],
            'date_of_birth' => ['nullable', 'date'],
            'gender' => ['nullable', 'string', 'max:10'],
            'address_ktp' => ['nullable', 'string', 'max:255'],
            'address_domicile' => ['nullable', 'string', 'max:255'],

            'institution_name' => ['required_if:type,institution', 'string', 'max:200'],
            'institution_address' => ['nullable', 'string', 'max:255'],
            'contact_person_name' => ['required_if:type,institution', 'string', 'max:150'],
            'contact_person_phone' => ['required_if:type,institution', 'string', 'max:30'],
            'contact_person_email' => ['required_if:type,institution', 'email', 'max:150'],
        ];

        // Kalau email_ci ada → validasi unique ke email_ci (case-insensitive)
        if (Schema::hasColumn('clients', 'email_ci')) {
            $rules['email_ci'] = [
                'nullable',
                'string',
                'max:150',
                Rule::unique('clients', 'email_ci')->whereNull('deleted_at'),
            ];
        } else {
            // Kalau belum ada email_ci → minimal unique ke email (case-sensitive)
            // (ini buat mencegah duplikasi basic; nanti kamu bisa migrate email_ci untuk case-insensitive)
            $rules['email'][] = Rule::unique('clients', 'email')->whereNull('deleted_at');
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'Email sudah terdaftar.',
            'email_ci.unique' => 'Email sudah terdaftar.',
            'institution_name.required_if' => 'Nama institusi wajib diisi.',
            'contact_person_name.required_if' => 'Nama narahubung wajib diisi.',
            'contact_person_phone.required_if' => 'Telepon narahubung wajib diisi.',
            'contact_person_email.required_if' => 'Email narahubung wajib diisi.',
            'contact_person_email.email' => 'Format email narahubung tidak valid.',
        ];
    }
}
