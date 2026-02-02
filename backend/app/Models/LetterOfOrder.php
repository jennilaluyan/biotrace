<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

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
        return $this->hasMany(LooSignature::class, 'lo_id', 'lo_id');
    }

    public function items(): HasMany
    {
        $rel = $this->hasMany(LetterOfOrderItem::class, 'lo_id', 'lo_id');

        // Jangan asumsi nama PK kolomnya selalu item_id.
        // Pilih kolom order yang benar-benar ada di table.
        $table = (new LetterOfOrderItem())->getTable(); // biasanya "letter_of_order_items"

        if (Schema::hasColumn($table, 'item_id')) {
            return $rel->orderBy('item_id');
        }

        if (Schema::hasColumn($table, 'lo_item_id')) {
            return $rel->orderBy('lo_item_id');
        }

        if (Schema::hasColumn($table, 'id')) {
            return $rel->orderBy('id');
        }

        // fallback aman: tanpa orderBy supaya tidak meledak
        return $rel;
    }

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }
}