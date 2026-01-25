<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClientApplication extends Model
{
    protected $table = 'client_applications';
    protected $primaryKey = 'client_application_id';

    // sesuaikan dengan migration kamu: kalau tabel punya timestamps, set true.
    public $timestamps = true;

    protected $fillable = [
        'status',
        'type',
        'name',
        'phone',
        'email',
        'email_ci',

        // individual optional
        'national_id',
        'date_of_birth',
        'gender',
        'address_ktp',
        'address_domicile',

        // institution optional
        'institution_name',
        'institution_address',
        'contact_person_name',
        'contact_person_phone',
        'contact_person_email',

        // auth
        'password_hash',

        // approval metadata (kalau ada kolomnya)
        'approved_client_id',
        'approved_at',
        'approved_by',
        'rejected_at',
        'rejected_by',
        'reject_reason',
    ];
}