<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LooSampleApproval extends Model
{
    protected $table = 'loo_sample_approvals';
    protected $primaryKey = 'approval_id';
    public $timestamps = false;

    protected $fillable = [
        'sample_id',
        'role_code',
        'approved_by_staff_id',
        'approved_at',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function staff(): BelongsTo
    {
        // table is "staffs" in your project
        return $this->belongsTo(Staff::class, 'approved_by_staff_id', 'staff_id');
    }
}
