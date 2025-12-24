<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\SerializesDatesToIsoMillisUtc;

class AuditLog extends Model
{
    use SerializesDatesToIsoMillisUtc;
    protected $table = 'audit_logs';
    protected $primaryKey = 'log_id';
    public $timestamps = false;

    protected $casts = [
        'timestamp' => 'datetime', // IMPORTANT
        'old_values' => 'array',
        'new_values' => 'array',
    ];

    public function actor()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'staff_id', 'staff_id');
    }
}
