<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Sample extends Model
{
    /**
     * --------------------------------------------------------------
     * Table name
     * --------------------------------------------------------------
     * Default Laravel: "samples"
     * Tidak perlu override.
     */

    /**
     * --------------------------------------------------------------
     * Primary key
     * --------------------------------------------------------------
     * Sesuai migration:
     *   $table->bigIncrements('sample_id');
     */
    protected $primaryKey = 'sample_id';
    public $incrementing = true;
    protected $keyType = 'int';

    /**
     * --------------------------------------------------------------
     * Timestamps
     * --------------------------------------------------------------
     * created_at → default null
     * updated_at → default null
     *
     * Migration kamu TIDAK membuat timestamps otomatis (tidak ada $table->timestamps()),
     * jadi set ->timestamps = false biar Laravel tidak expect kolom itu.
     */
    public $timestamps = false;

    /**
     * --------------------------------------------------------------
     * Mass Assignment
     * --------------------------------------------------------------
     * Field yang boleh diisi saat Sample::create($data)
     */
    protected $fillable = [
        'client_id',
        'received_at',
        'sample_type',
        'examination_purpose',
        'contact_history',
        'priority',
        'current_status',
        'additional_notes',
        'created_by',
    ];

    /**
     * --------------------------------------------------------------
     * Relationships
     * --------------------------------------------------------------
     */

    // FK: samples.client_id → clients.client_id
    public function client()
    {
        return $this->belongsTo(Client::class, 'client_id', 'client_id');
    }

    // FK: samples.created_by → staffs.staff_id
    public function creator()
    {
        return $this->belongsTo(Staff::class, 'created_by', 'staff_id');
    }
}
