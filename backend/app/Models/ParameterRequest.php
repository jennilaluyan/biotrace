<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ParameterRequest extends Model
{
    use HasFactory;

    protected $table = 'parameter_requests';

    public $timestamps = true;

    protected $fillable = [
        'parameter_name',
        'category',
        'reason',
        'status',
        'requested_by',
        'requested_at',
        'decided_by',
        'decided_at',
        'decision_note',
        'approved_parameter_id',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'decided_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'approved_parameter_id' => 'integer',
        'requested_by' => 'integer',
        'decided_by' => 'integer',
    ];

    public function requester()
    {
        return $this->belongsTo(Staff::class, 'requested_by', 'staff_id');
    }

    public function decider()
    {
        return $this->belongsTo(Staff::class, 'decided_by', 'staff_id');
    }

    public function approvedParameter()
    {
        return $this->belongsTo(Parameter::class, 'approved_parameter_id', 'parameter_id');
    }
}