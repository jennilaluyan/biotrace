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
        'catalog_no',
        'code',
        'workflow_group',
        'name',
        'unit',
        'unit_id',
        'method_ref',
        'created_by',
        'status',
        'tag',
    ];

    protected $casts = [
        'catalog_no' => 'integer',
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