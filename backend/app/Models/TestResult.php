<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TestResult extends Model
{
    protected $table = 'test_results';
    protected $primaryKey = 'result_id';
    public $incrementing = true;
    protected $keyType = 'int';

    protected $fillable = [
        'sample_test_id',
        'created_by',
        'raw_data',
        'calc_data',
        'interpretation',
        'version_no',
        'value_raw',
        'value_final',
        'unit_id',
        'flags',
    ];

    protected $casts = [
        'raw_data'  => 'array',
        'calc_data' => 'array',
        'flags'     => 'array',
        'version_no' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function sampleTest()
    {
        return $this->belongsTo(\App\Models\SampleTest::class, 'sample_test_id', 'sample_test_id');
    }

    public function creator()
    {
        return $this->belongsTo(\App\Models\Staff::class, 'created_by', 'staff_id');
    }
}
