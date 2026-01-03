<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReagentCalculation extends Model
{
    protected $table = 'reagent_calculations';
    protected $primaryKey = 'calc_id';
    public $incrementing = true;
    protected $keyType = 'int';

    // Karena kamu pakai created_at/updated_at manual timestampTz, tapi tetap compatible:
    public $timestamps = false;

    protected $fillable = [
        'sample_id',
        'computed_by',
        'edited_by',
        'om_approved_by',
        'payload',
        'locked',
        'computed_at',
        'edited_at',
        'created_at',
        'updated_at',
        'om_approved_at',
        'version_no',
        'notes',
    ];

    protected $casts = [
        'payload'        => 'array',
        'locked'         => 'boolean',
        'version_no'     => 'integer',
        'computed_at'    => 'datetime',
        'edited_at'      => 'datetime',
        'created_at'     => 'datetime',
        'updated_at'     => 'datetime',
        'om_approved_at' => 'datetime',
    ];
}