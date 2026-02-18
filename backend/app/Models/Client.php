<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class Client extends Authenticatable
{
    use HasApiTokens, Notifiable, SoftDeletes;

    protected $primaryKey = 'client_id';
    public $incrementing = true;
    protected $keyType = 'int';
    public $timestamps = true;

    protected $fillable = [
        'staff_id',
        'type',
        'name',
        'phone',
        'email',
        'email_ci',
        'locale',

        // Individual
        'national_id',
        'date_of_birth',
        'gender',
        'address_ktp',
        'address_domicile',

        // Institution
        'institution_name',
        'institution_address',
        'contact_person_name',
        'contact_person_phone',
        'contact_person_email',

        // portal auth
        'password_hash',
        'is_active',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'date_of_birth' => 'date',
    ];

    public function getAuthPassword(): string
    {
        return (string) $this->password_hash;
    }

    public function staff()
    {
        return $this->belongsTo(Staff::class, 'staff_id', 'staff_id');
    }

    public function samples()
    {
        return $this->hasMany(Sample::class, 'client_id', 'client_id');
    }
}
