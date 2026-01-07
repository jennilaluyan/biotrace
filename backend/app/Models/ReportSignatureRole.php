<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReportSignatureRole extends Model
{
    protected $table = 'report_signature_roles';
    protected $primaryKey = 'role_code';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'role_code',
        'role_name',
        'sort_order',
        'is_required',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'is_required' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function signatures(): HasMany
    {
        return $this->hasMany(ReportSignature::class, 'role_code', 'role_code');
    }
}
