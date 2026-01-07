<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportItem extends Model
{
    protected $table = 'report_items';
    protected $primaryKey = 'report_item_id';
    public $timestamps = false;

    protected $fillable = [
        'report_id',
        'sample_test_id',
        'parameter_name',
        'method_name',
        'result_value',
        'unit_label',
        'flags',
        'interpretation',
        'tested_at',
        'order_no',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'flags' => 'array',
        'tested_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class, 'report_id', 'report_id');
    }

    public function sampleTest(): BelongsTo
    {
        return $this->belongsTo(SampleTest::class, 'sample_test_id', 'sample_test_id');
    }
}
