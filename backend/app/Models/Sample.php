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
        'sample_type',
        'examination_purpose',
        'contact_history',
        'priority',
        'current_status',
        'request_status',
        'submitted_at',
        'reviewed_at',
        'ready_at',
        'physically_received_at',
        'lab_sample_code',
        'additional_notes',
        'created_by',
        'assigned_to'
    ];

    protected $casts = [
        'received_at' => 'datetime',
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'ready_at' => 'datetime',
        'physically_received_at' => 'datetime',
        'priority'    => 'integer',
    ];

    protected $appends = [
        'status_enum',
    ];

    // Relasi ke client (pakai client_id)
    public function client()
    {
        return $this->belongsTo(Client::class, 'client_id', 'client_id');
    }

    // Staf yang membuat entri (created_by -> staffs.staff_id)
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
     * Status high-level (registered/testing/reported) yang dihitung dari current_status.
     */
    public function getStatusEnumAttribute(): ?string
    {
        if (!$this->current_status) {
            return null;
        }

        $enum = SampleHighLevelStatus::fromCurrentStatus($this->current_status);
        return $enum->value;
    }
}
