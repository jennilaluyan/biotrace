<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Enums\SampleHighLevelStatus;
use App\Models\Concerns\SerializesDatesToIsoMillisUtc;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Sample extends Model
{
    use HasFactory;
    use SerializesDatesToIsoMillisUtc;

    protected $table = 'samples';
    protected $primaryKey = 'sample_id';

    public $timestamps = false;

    protected $fillable = [
        'client_id',
        'received_at',
        'sample_type',
        'examination_purpose',
        'contact_history',
        'priority',
        'current_status',
        'additional_notes',
        'created_by',
        'assigned_to',
        'request_id',
    ];

    protected $casts = [
        'received_at' => 'datetime',
        'priority'    => 'integer',
    ];

    protected $appends = [
        'status_enum',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id', 'client_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'created_by', 'staff_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'assigned_to', 'staff_id');
    }

    public function sampleRequest(): BelongsTo
    {
        return $this->belongsTo(SampleRequest::class, 'request_id', 'request_id');
    }

    public function comments()
    {
        return $this->hasMany(\App\Models\SampleComment::class, 'sample_id', 'sample_id')
            ->orderByDesc('created_at');
    }

    public function getStatusEnumAttribute(): ?string
    {
        if (!$this->current_status) return null;

        $enum = SampleHighLevelStatus::fromCurrentStatus($this->current_status);
        return $enum->value;
    }
}
