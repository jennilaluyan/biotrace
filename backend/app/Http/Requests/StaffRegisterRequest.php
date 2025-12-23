<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StaffRegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        // register staff publik (belum login)
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],

            'email' => [
                'required',
                'email',
                'max:255',
                // unik (case-insensitive sudah ada index), tapi validasi tetap pakai unique normal
                Rule::unique('staffs', 'email'),
            ],

            'password' => ['required', 'string', 'min:8', 'confirmed'],
            // Laravel otomatis cek password_confirmation jika pakai confirmed

            'role_id' => [
                'required',
                'integer',
                // allow only these roles to self-register:
                // Administrator(2), Sample Collector(3), Analyst(4), Operational Manager(5)
                // ❌ Client(1) dan ❌ Lab Head(6) tidak boleh register mandiri
                Rule::in([2, 3, 4, 5]),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'role_id.in' => 'Role tidak diizinkan untuk registrasi mandiri.',
            'password.confirmed' => 'Konfirmasi password tidak cocok.',
        ];
    }
}
