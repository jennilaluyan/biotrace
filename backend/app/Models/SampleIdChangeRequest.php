<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SampleIdChangeRequest extends Model
{
    protected $table = 'sample_id_change_requests';
    protected $primaryKey = 'change_request_id';

    public $timestamps = true;

    protected $fillable = [
        'sample_id',
        'suggested_sample_id',
        'proposed_sample_id',
        'status',
        'requested_by_staff_id',
        'reviewed_by_staff_id',
        'review_note',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function sample()
    {
        return $this->belongsTo(\App\Models\Sample::class, 'sample_id', 'sample_id');
    }

    public function requestedBy()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'requested_by_staff_id', 'staff_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'reviewed_by_staff_id', 'staff_id');
    }
}