<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QcRun extends Model
{
    protected $table = 'qc_runs';
    protected $primaryKey = 'qc_run_id';
    public $incrementing = true;
    protected $keyType = 'int';

    protected $fillable = [
        'batch_id',
        'qc_control_id',
        'value',
        'z_score',
        'violations',
        'status',
        'created_by',
    ];

    protected $casts = [
        'value' => 'decimal:6',
        'z_score' => 'decimal:6',
        'violations' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function qcControl()
    {
        return $this->belongsTo(QcControl::class, 'qc_control_id', 'qc_control_id');
    }
}
