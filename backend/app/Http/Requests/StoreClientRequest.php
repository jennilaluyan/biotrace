<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreClientRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Nanti bisa ganti ke policy / role-based, tapi untuk sekarang:
        return $this->user() !== null; // cuma user login yang boleh
    }

    public function rules(): array
    {
        return [
            // staff_id TIDAK dikirim dari frontend, nanti kita isi di controller
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
    }
}
