<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReagentRule extends Model
{
    protected $table = 'reagent_rules';
    protected $primaryKey = 'rule_id';

    protected $guarded = [];

    protected $casts = [
        'is_active' => 'boolean',
        'formula'   => 'array',
    ];
}