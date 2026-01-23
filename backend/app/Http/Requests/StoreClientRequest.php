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
        // HANYA generate email_ci kalau kolomnya memang ada
        if (!Schema::hasColumn('clients', 'email_ci')) {
            return;
        }

        $email = $this->input('email');
        if (!is_string($email)) return;

        $email = trim($email);
        if ($email === '') {
            $this->merge(['email' => null, 'email_ci' => null]);
            return;
        }

        $this->merge([
            'email' => $email,
            'email_ci' => mb_strtolower($email),
        ]);
    }

    public function rules(): array
    {
        $rules = [
            'type' => ['required', 'in:individual,institution'],

            'name'  => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:150'],

            // Individual fields
            'national_id'       => ['nullable', 'string', 'max:50'],
            'date_of_birth'     => ['nullable', 'date'],
            'gender'            => ['nullable', 'string', 'max:10'],
            'address_ktp'       => ['nullable', 'string', 'max:255'],
            'address_domicile'  => ['nullable', 'string', 'max:255'],

            // Institutional fields
            'institution_name'      => ['nullable', 'string', 'max:200'],
            'institution_address'   => ['nullable', 'string', 'max:255'],
            'contact_person_name'   => ['nullable', 'string', 'max:150'],
            'contact_person_phone'  => ['nullable', 'string', 'max:30'],
            'contact_person_email'  => ['nullable', 'email', 'max:150'],
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
        ];
    }
}
