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
        'unit',
        'method_ref',
        'created_by',
        'status',
        'tag',
    ];
}
