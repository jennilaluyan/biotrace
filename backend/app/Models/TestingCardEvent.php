<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TestingCardEvent extends Model
{
    protected $table = 'testing_card_events';
    protected $primaryKey = 'event_id';
    public $timestamps = false;

    protected $fillable = [
        'board_id',
        'sample_id',
        'from_column_id',
        'to_column_id',
        'moved_by_staff_id',
        'moved_at',
        'note',
        'meta',
    ];

    protected $casts = [
        'moved_at' => 'datetime',
        'meta' => 'array',
    ];

    public function board(): BelongsTo
    {
        return $this->belongsTo(TestingBoard::class, 'board_id', 'board_id');
    }

    public function sample(): BelongsTo
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function fromColumn(): BelongsTo
    {
        return $this->belongsTo(TestingColumn::class, 'from_column_id', 'column_id');
    }

    public function toColumn(): BelongsTo
    {
        return $this->belongsTo(TestingColumn::class, 'to_column_id', 'column_id');
    }

    public function movedBy(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'moved_by_staff_id', 'staff_id');
    }
}
