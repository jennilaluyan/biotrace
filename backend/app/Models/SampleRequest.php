<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SampleRequest extends Model
{
    use HasFactory;

    protected $table = 'sample_requests';
    protected $primaryKey = 'request_id';

    public $timestamps = true;

    protected $fillable = [
        'client_id',
        'intended_sample_type',
        'examination_purpose',
        'contact_history',
        'priority',
        'additional_notes',
        'request_status',
        'handed_over_by',
        'handed_over_at',
        'intake_checked_by',
        'intake_checked_at',
        'intake_result',
        'intake_notes',
    ];

    protected $casts = [
        'handed_over_at' => 'datetime',
        'intake_checked_at' => 'datetime',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class, 'client_id', 'client_id');
    }

    // ✅ ONLY ONE items()
    public function items()
    {
        return $this->hasMany(SampleRequestItem::class, 'request_id', 'request_id');
    }

    public function sample()
    {
        return $this->hasOne(Sample::class, 'request_id', 'request_id');
    }

    public function handedOverBy()
    {
        return $this->belongsTo(Staff::class, 'handed_over_by', 'staff_id');
    }

    public function intakeCheckedBy()
    {
        return $this->belongsTo(Staff::class, 'intake_checked_by', 'staff_id');
    }
}
