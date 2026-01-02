<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Parameter extends Model
{
    use HasFactory;

    protected $table = 'parameters';
    protected $primaryKey = 'parameter_id';

    public $timestamps = true;

    protected $fillable = [
        'code',
        'name',
        'unit',       // legacy string
        'unit_id',    // new FK (nullable)
        'method_ref',
        'created_by',
        'status',     // Active/Inactive
        'tag',        // Routine/Research
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function unitRel()
    {
        return $this->belongsTo(Unit::class, 'unit_id', 'unit_id');
    }

    public function sampleTests()
    {
        return $this->hasMany(SampleTest::class, 'parameter_id', 'parameter_id');
    }
}
