<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SampleTest extends Model
{
    use HasFactory;

    protected $table = 'sample_tests';
    protected $primaryKey = 'test_id'; // kalau di migration kamu pakai id lain, ganti sesuai kolom PK-nya

    public $timestamps = false; // ubah jadi true kalau tabel punya created_at & updated_at

    protected $fillable = [
        'sample_id',
        'parameter_id',
        'assigned_to',
        'created_at', // boleh ada walau timestamps=false, karena kamu set manual di controller
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function sample()
    {
        return $this->belongsTo(Sample::class, 'sample_id', 'sample_id');
    }

    public function parameter()
    {
        return $this->belongsTo(Parameter::class, 'parameter_id', 'parameter_id');
    }

    public function assignee()
    {
        return $this->belongsTo(Staff::class, 'assigned_to', 'staff_id');
    }
}
