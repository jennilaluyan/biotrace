<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FileBlob extends Model
{
    protected $table = 'files';
    protected $primaryKey = 'file_id';
    public $incrementing = true;
    protected $keyType = 'int';

    protected $fillable = [
        'original_name',
        'ext',
        'mime_type',
        'size_bytes',
        'sha256',
        'bytes',
        'created_by',
    ];

    protected $casts = [
        'size_bytes' => 'int',
        'created_by' => 'int',
    ];
}