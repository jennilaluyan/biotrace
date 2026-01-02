<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $table = 'audit_logs';
    protected $primaryKey = 'log_id';
    public $timestamps = false;

    protected $fillable = [
        'staff_id',
        'entity_name',
        'entity_id',
        'action',
        'timestamp',
        'ip_address',
        'old_values',
        'new_values',
    ];

    protected $casts = [
        'timestamp'  => 'datetime', // IMPORTANT
        'old_values' => 'array',
        'new_values' => 'array',
    ];

    public function actor()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'staff_id', 'staff_id');
    }
}
