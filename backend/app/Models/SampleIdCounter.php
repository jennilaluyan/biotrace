<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SampleIdCounter extends Model
{
    protected $table = 'sample_id_counters';
    protected $primaryKey = 'prefix';
    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = true;

    protected $fillable = [
        'prefix',
        'last_number',
    ];

    protected $casts = [
        'last_number' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}