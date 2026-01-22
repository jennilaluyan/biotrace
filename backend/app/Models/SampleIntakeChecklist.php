<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SampleIntakeChecklist extends Model
{
    use HasFactory;

    protected $table = 'sample_intake_checklists';

    protected $fillable = [
        'sample_id',
        'checklist',
        'notes',
        'is_passed',
        'checked_by',
        'checked_at',
    ];

    protected $casts = [
        'checklist' => 'array',
        'is_passed' => 'boolean',
        'checked_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function sample()
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function checker()
    {
        return $this->belongsTo(Staff::class, 'checked_by', 'staff_id');
    }
}
