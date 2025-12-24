<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class SampleComment extends Model
{
    use HasFactory;

    protected $table = 'sample_comments';
    protected $primaryKey = 'comment_id';
    public $timestamps = false;

    protected $fillable = [
        'sample_id',
        'staff_id',
        'body',
        'status_snapshot',
        'visible_to_role_ids',
        'created_at',
    ];

    protected $casts = [
        'visible_to_role_ids' => 'array',
        'created_at' => 'datetime',
    ];

    public function sample()
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function author()
    {
        return $this->belongsTo(Staff::class, 'staff_id', 'staff_id');
    }
}