<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QcControl extends Model
{
    protected $table = 'qc_controls';
    protected $primaryKey = 'qc_control_id';
    public $incrementing = true;
    protected $keyType = 'int';

    protected $fillable = [
        'parameter_id',
        'method_id',
        'control_type',
        'target',
        'tolerance',
        'ruleset',
        'is_active',
        'note',
    ];

    protected $casts = [
        'target' => 'decimal:6',
        'tolerance' => 'decimal:6',
        'ruleset' => 'array',
        'is_active' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Optional relationships (biar FE bisa show label kalau dibutuhkan)
    public function parameter()
    {
        return $this->belongsTo(Parameter::class, 'parameter_id', 'parameter_id');
    }

    public function method()
    {
        return $this->belongsTo(Method::class, 'method_id', 'method_id');
    }
}
