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
        'additional_notes',
        'created_by',
        'assigned_to'
    ];

    protected $casts = [
        'received_at' => 'datetime',
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

    /**
     * Status high-level (registered/testing/reported) yang dihitung dari current_status.
     */
    public function getStatusEnumAttribute(): ?string
    {
        if (!$this->current_status) {
            return null;
        }

        // Gunakan enum untuk mapping detail → high-level
        $enum = SampleHighLevelStatus::fromCurrentStatus($this->current_status);

        // Di JSON, kita kirim value string lower-case: registered/testing/reported
        return $enum->value;
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
}
