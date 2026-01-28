<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LetterOfOrder extends Model
{
    protected $table = 'letters_of_order';
    protected $primaryKey = 'lo_id';
    public $timestamps = false;

    protected $fillable = [
        'sample_id',
        'number',
        'generated_at',
        'generated_by',
        'file_url',
        'loa_status',
        'sent_to_client_at',
        'client_signed_at',
        'locked_at',
        'payload',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'generated_at' => 'datetime',
        'sent_to_client_at' => 'datetime',
        'client_signed_at' => 'datetime',
        'locked_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'payload' => 'array',
    ];

    public function signatures(): HasMany
    {
        return $this->hasMany(LoaSignature::class, 'lo_id', 'lo_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(LetterOfOrderItem::class, 'lo_id', 'lo_id')
            ->orderBy('item_id');
    }

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }
}
