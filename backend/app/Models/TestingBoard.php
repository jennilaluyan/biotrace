<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TestingBoard extends Model
{
    protected $table = 'testing_boards';
    protected $primaryKey = 'board_id';
    public $timestamps = false;

    protected $fillable = [
        'workflow_group',
        'name',
        'settings',
        'created_by_staff_id',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'settings' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function columns(): HasMany
    {
        return $this->hasMany(TestingColumn::class, 'board_id', 'board_id')
            ->orderBy('position');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'created_by_staff_id', 'staff_id');
    }
}
