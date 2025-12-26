<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SampleRequestItem extends Model
{
    use HasFactory;

    protected $table = 'sample_request_items';

    protected $fillable = [
        'request_id',
        'parameter_id',
        'method_ref',
        'notes',
    ];

    // relations
    public function request()
    {
        return $this->belongsTo(SampleRequest::class, 'request_id', 'request_id');
    }

    public function parameter()
    {
        return $this->belongsTo(Parameter::class, 'parameter_id', 'parameter_id');
    }
}
