<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConsumableCatalogItem extends Model
{
    protected $table = 'consumables_catalog';
    protected $primaryKey = 'catalog_id';

    protected $fillable = [
        'item_type',
        'name',
        'specification',
        'default_unit_id',
        'default_unit_text',
        'category',
        'is_active',
        'source_file',
        'source_sheet',
        'source_row',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'source_row' => 'integer',
        'default_unit_id' => 'integer',
    ];

    public function defaultUnit()
    {
        return $this->belongsTo(Unit::class, 'default_unit_id', 'unit_id');
    }
}