<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportSignature extends Model
{
    protected $table = 'report_signatures';
    protected $primaryKey = 'signature_id';
    public $timestamps = false;

    protected $fillable = [
        'report_id',
        'role_code',
        'signed_by',
        'signed_at',
        'signature_hash',
        'note',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class, 'report_id', 'report_id');
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(ReportSignatureRole::class, 'role_code', 'role_code');
    }

    public function signer(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'signed_by', 'staff_id');
    }
}
