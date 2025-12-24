<?php

namespace App\Http\Controllers;

use App\Http\Requests\StaffRegisterRequest;
use App\Models\Staff;
use Illuminate\Support\Facades\Hash;
use App\Support\ApiResponse;
use App\Support\AuditLogger;

class StaffRegistrationController extends Controller
{
    // POST /api/v1/staffs/register
    public function register(StaffRegisterRequest $request)
    {
        $data = $request->validated();

        $staff = Staff::create([
            'name'          => $data['name'],
            'email'         => $data['email'],
            'password_hash' => Hash::make($data['password']),
            'role_id'       => $data['role_id'],
            // sesuai requirement: pending approval Lab Head
            'is_active'     => false,
        ]);

        // audit (staffId null? -> AuditLogger::write akan skip kalau entity_id null/staff_id null)
        // jadi kita log dengan staffId = staff yang baru dibuat (actor = self-register)
        AuditLogger::write(
            'STAFF_REGISTER_SUBMITTED',
            $staff->getKey(),
            'staffs',
            $staff->getKey(),
            null,
            [
                'email'    => $staff->email,
                'role_id'  => $staff->role_id,
                'is_active' => $staff->is_active,
            ]
        );

        return ApiResponse::success(
            data: [
                'staff_id'  => $staff->staff_id,
                'name'      => $staff->name,
                'email'     => $staff->email,
                'role_id'   => $staff->role_id,
                'is_active' => $staff->is_active,
            ],
            message: 'Staff registration submitted. Waiting for Laboratory Head approval.',
            status: 201,
            extra: ['resource' => 'staffs']
        );
    }
}
