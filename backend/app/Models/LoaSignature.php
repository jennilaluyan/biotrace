<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoaSignature extends Model
{
    protected $table = 'loa_signatures';
    protected $primaryKey = 'signature_id';
    public $timestamps = false;

    protected $fillable = [
        'lo_id',
        'role_code',
        'signed_by_staff',
        'signed_by_client',
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

    public function letter(): BelongsTo
    {
        return $this->belongsTo(LetterOfOrder::class, 'lo_id', 'lo_id');
    }

    public function staffSigner(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'signed_by_staff', 'staff_id');
    }

    public function clientSigner(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'signed_by_client', 'client_id');
    }
}
