<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    use HasFactory;

    protected $table = 'roles';
    protected $primaryKey = 'role_id';
    public $timestamps = true;

    // Sudah tidak ada kolom "code", hapus dari fillable
    protected $fillable = ['name', 'description'];

    public function staffs()
    {
        return $this->hasMany(Staff::class, 'role_id', 'role_id');
    }
}
