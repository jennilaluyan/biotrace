<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QualityCover extends Model
{
    protected $table = 'quality_covers';
    protected $primaryKey = 'quality_cover_id';

    protected $fillable = [
        'sample_id',
        'workflow_group',
        'parameter_id',
        'parameter_label',
        'date_of_analysis',
        'method_of_analysis',
        'checked_by_staff_id',
        'qc_payload',
        'status',
        'submitted_at',
        'verified_by_staff_id',
        'verified_at',
        'validated_by_staff_id',
        'validated_at',
        'reject_reason',
        'rejected_by_staff_id',
        'rejected_at',
    ];

    protected $casts = [
        'date_of_analysis' => 'date',
        'submitted_at' => 'datetime',
        'verified_at' => 'datetime',
        'validated_at' => 'datetime',
        'rejected_at' => 'datetime',
        'qc_payload' => 'array',
    ];

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function checkedBy()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'checked_by_staff_id', 'staff_id');
    }

    public function verifiedBy()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'verified_by_staff_id', 'staff_id');
    }

    public function validatedBy()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'validated_by_staff_id', 'staff_id');
    }
}
