<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Unit extends Model
{
    use HasFactory;

    protected $table = 'units';
    protected $primaryKey = 'unit_id';

    public $timestamps = true;

    protected $fillable = [
        'name',
        'symbol',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function parameters()
    {
        return $this->hasMany(Parameter::class, 'unit_id', 'unit_id');
    }

    public function reagents()
    {
        return $this->hasMany(Reagent::class, 'unit_id', 'unit_id');
    }

    public function testResults()
    {
        return $this->hasMany(TestResult::class, 'unit_id', 'unit_id');
    }
}
