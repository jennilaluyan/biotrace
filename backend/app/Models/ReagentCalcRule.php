<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReagentCalcRule extends Model
{
    protected $table = 'reagent_calc_rules';
    protected $primaryKey = 'rule_id';

    protected $fillable = [
        'name',
        'method_id',
        'parameter_id',
        'rule_json',
        'schema_version',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'rule_json' => 'array',
        'is_active' => 'boolean',
        'schema_version' => 'integer',
        'method_id' => 'integer',
        'parameter_id' => 'integer',
        'created_by' => 'integer',
    ];
}