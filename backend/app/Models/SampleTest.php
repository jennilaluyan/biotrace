<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SampleTest extends Model
{
    use HasFactory;

    protected $table = 'sample_tests';
    protected $primaryKey = 'sample_test_id';

    public $timestamps = true;

    protected $fillable = [
        'sample_id',
        'parameter_id',
        'method_id',
        'assigned_to',
        'started_at',
        'completed_at',
        'status',          // draft|in_progress|measured|verified|validated|cancelled|failed
        'qc_done',
        'om_verified',
        'om_verified_at',
        'lh_validated',
        'lh_validated_at',
    ];

    protected $casts = [
        'qc_done'         => 'boolean',
        'om_verified'     => 'boolean',
        'lh_validated'    => 'boolean',
        'started_at'      => 'datetime',
        'completed_at'    => 'datetime',
        'om_verified_at'  => 'datetime',
        'lh_validated_at' => 'datetime',
        'created_at'      => 'datetime',
        'updated_at'      => 'datetime',
    ];

    public function sample()
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function parameter()
    {
        return $this->belongsTo(Parameter::class, 'parameter_id', 'parameter_id');
    }

    public function method()
    {
        return $this->belongsTo(Method::class, 'method_id', 'method_id');
    }

    public function results()
    {
        return $this->hasMany(TestResult::class, 'sample_test_id', 'sample_test_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'assigned_to', 'staff_id');
    }

    public function latestResult(): HasOne
    {
        // ambil result dengan version_no terbesar
        return $this->hasOne(TestResult::class, 'sample_test_id', 'sample_test_id')
            ->ofMany('version_no', 'max');
    }

    public function reportItems()
    {
        return $this->hasMany(\App\Models\ReportItem::class, 'sample_test_id', 'sample_test_id');
    }
}
