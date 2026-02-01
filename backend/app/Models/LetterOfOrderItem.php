<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LetterOfOrderItem extends Model
{
    protected $table = 'letter_of_order_items';
    protected $primaryKey = 'item_id';
    public $timestamps = false;

    protected $fillable = [
        'lo_id',
        'sample_id',
        'lab_sample_code',
        'parameters',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'parameters' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function loa(): BelongsTo
    {
        return $this->belongsTo(LetterOfOrder::class, 'lo_id', 'lo_id');
    }

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }
}
