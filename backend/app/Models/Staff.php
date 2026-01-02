<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Staff extends Authenticatable
{
    use HasApiTokens, HasFactory;

    // Table & PK to match your migration
    protected $table = 'staffs';
    protected $primaryKey = 'staff_id';

    protected $fillable = [
        'name',
        'email',
        'password_hash',
        'role_id',
        'is_active',
    ];

    // Use email for auth identifier
    public function getAuthIdentifierName()
    {
        return 'email';
    }

    // Map password column used for auth
    public function getAuthPassword()
    {
        // your column is password_hash
        return $this->password_hash;
    }

    protected $hidden = ['password_hash'];
    protected $casts = [
        'is_active' => 'boolean',
    ];

    // (Optional) relation to roles table if needed in future
    public function role()
    {
        return $this->belongsTo(\App\Models\Role::class, 'role_id', 'role_id');
    }

    public function assignedSampleTests()
    {
        return $this->hasMany(\App\Models\SampleTest::class, 'assigned_to', 'staff_id');
    }
}
