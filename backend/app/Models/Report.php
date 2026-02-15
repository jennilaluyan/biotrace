<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Report extends Model
{
    protected $table = 'reports';
    protected $primaryKey = 'report_id';
    public $timestamps = false; // sesuai migration: created_at/updated_at custom

    protected $fillable = [
        'sample_id',
        'report_no',
        'generated_at',
        'generated_by',
        'pdf_url',
        'is_locked',
        'created_at',
        'updated_at',
        'pdf_file_id',
    ];

    protected $casts = [
        'generated_at' => 'datetime',
        'is_locked' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'pdf_file_id' => 'integer',
    ];

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function generator(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'generated_by', 'staff_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ReportItem::class, 'report_id', 'report_id')
            ->orderBy('order_no')
            ->orderBy('report_item_id');
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(ReportSignature::class, 'report_id', 'report_id')
            ->orderBy('role_code');
    }
}
