<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TestResult extends Model
{
    use HasFactory;

    protected $table = 'test_results';
    protected $primaryKey = 'result_id';

    public $timestamps = true;

    protected $fillable = [
        'sample_test_id',
        'value_raw',
        'value_final',
        'unit_id',
        'flags', // jsonb
    ];

    protected $casts = [
        'flags'      => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function sampleTest()
    {
        return $this->belongsTo(SampleTest::class, 'sample_test_id', 'sample_test_id');
    }

    public function unitRel()
    {
        return $this->belongsTo(Unit::class, 'unit_id', 'unit_id');
    }
}
