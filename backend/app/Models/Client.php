<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    /**
     * --------------------------------------------------------------
     * Table name
     * --------------------------------------------------------------
     * Laravel default = plural of model name → "clients"
     * Jadi tidak perlu set $table manual.
     */

    /**
     * --------------------------------------------------------------
     * Primary key
     * --------------------------------------------------------------
     * Sesuai migration:
     *   $table->bigIncrements('client_id');
     */
    protected $primaryKey = 'client_id';
    public $incrementing = true;
    protected $keyType = 'int';

    /**
     * --------------------------------------------------------------
     * Timestamps
     * --------------------------------------------------------------
     * created_at → timestampTz (auto)
     * updated_at → timestampTz (nullable)
     */
    public $timestamps = true;

    /**
     * --------------------------------------------------------------
     * Mass Assignment
     * --------------------------------------------------------------
     * Field yang boleh diisi via Client::create($data)
     */
    protected $fillable = [
        'staff_id',
        'type',
        'name',
        'phone',
        'email',

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
    ];

    /**
     * --------------------------------------------------------------
     * Relationships
     * --------------------------------------------------------------
     * 1 client dimiliki oleh 1 staff (PIC)
     * 1 client punya banyak samples
     */

    // FK: clients.staff_id → staffs.staff_id
    public function staff()
    {
        return $this->belongsTo(Staff::class, 'staff_id', 'staff_id');
    }

    // Relasi sampel
    public function samples()
    {
        return $this->hasMany(Sample::class, 'client_id', 'client_id');
    }
}
