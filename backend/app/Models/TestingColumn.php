<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TestingColumn extends Model
{
    protected $table = 'testing_columns';
    protected $primaryKey = 'column_id';
    public $timestamps = false;

    protected $fillable = [
        'board_id',
        'name',
        'position',
        'is_terminal',
        'created_by_staff_id',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'is_terminal' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function board(): BelongsTo
    {
        return $this->belongsTo(TestingBoard::class, 'board_id', 'board_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'created_by_staff_id', 'staff_id');
    }
}
