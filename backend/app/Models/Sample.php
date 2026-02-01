<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Enums\SampleHighLevelStatus;

class Sample extends Model
{
    use HasFactory;

    protected $table = 'samples';
    protected $primaryKey = 'sample_id';

    // Di migration kamu tidak ada created_at/updated_at
    public $timestamps = false;

    protected $fillable = [
        'client_id',
        'received_at',

        'scheduled_delivery_at',

        'sample_type',
        'examination_purpose',

        'current_status',
        'request_status',
        'submitted_at',
        'reviewed_at',
        'ready_at',
        'physically_received_at',
        'lab_sample_code',
        'additional_notes',
        'created_by',
        'assigned_to',

        // workflow request moderation
        'request_return_note',
        'request_approved_at',
        'request_returned_at',

        // physical workflow timestamps
        'admin_received_from_client_at',
        'admin_brought_to_collector_at',
        'collector_received_at',
        'collector_intake_completed_at',
        'collector_returned_to_admin_at',
        'admin_received_from_collector_at',
        'client_picked_up_at',

        // OM/LH verification gate + LOA metadata
        'verified_at',
        'verified_by_staff_id',
        'verified_by_role',
        'loa_generated_at',
        'loa_generated_by_staff_id',
    ];

    protected $casts = [
        'received_at' => 'datetime',
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'ready_at' => 'datetime',
        'physically_received_at' => 'datetime',
        'scheduled_delivery_at' => 'datetime',

        'request_approved_at' => 'datetime',
        'request_returned_at' => 'datetime',

        'admin_received_from_client_at' => 'datetime',
        'admin_brought_to_collector_at' => 'datetime',
        'collector_received_at' => 'datetime',
        'collector_intake_completed_at' => 'datetime',
        'collector_returned_to_admin_at' => 'datetime',
        'admin_received_from_collector_at' => 'datetime',
        'client_picked_up_at' => 'datetime',

        // OM/LH verification gate + LOA metadata
        'verified_at' => 'datetime',
        'loa_generated_at' => 'datetime',
    ];

    protected $appends = [
        'status_enum',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class, 'client_id', 'client_id');
    }

    public function creator()
    {
        return $this->belongsTo(Staff::class, 'created_by', 'staff_id');
    }

    public function comments()
    {
        return $this->hasMany(\App\Models\SampleComment::class, 'sample_id', 'sample_id')
            ->orderByDesc('created_at');
    }

    public function assignee()
    {
        return $this->belongsTo(Staff::class, 'assigned_to', 'staff_id');
    }

    public function sampleTests()
    {
        return $this->hasMany(\App\Models\SampleTest::class, 'sample_id', 'sample_id');
    }

    public function report()
    {
        return $this->hasOne(\App\Models\Report::class, 'sample_id', 'sample_id');
    }

    public function intakeChecklist()
    {
        return $this->hasOne(\App\Models\SampleIntakeChecklist::class, 'sample_id', 'sample_id');
    }

    /**
     * ✅ Requested parameters for request/intake (pivot)
     */
    public function requestedParameters()
    {
        return $this->belongsToMany(
            \App\Models\Parameter::class,
            'sample_requested_parameters',
            'sample_id',
            'parameter_id'
        )->withTimestamps();
    }

    public function getStatusEnumAttribute(): ?string
    {
        if (!$this->current_status) return null;
        $enum = SampleHighLevelStatus::fromCurrentStatus($this->current_status);
        return $enum->value;
    }
}
