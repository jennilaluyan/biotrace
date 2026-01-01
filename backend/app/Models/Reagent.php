<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Reagent extends Model
{
    use HasFactory;

    protected $table = 'reagents';
    protected $primaryKey = 'reagent_id';

    public $timestamps = true;

    protected $fillable = [
        'code',
        'name',
        'description',
        'unit_id',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function unitRel()
    {
        return $this->belongsTo(Unit::class, 'unit_id', 'unit_id');
    }
}
