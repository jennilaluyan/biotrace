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

    // (optional) kalau mau mass-assign
    protected $fillable = ['code', 'name', 'description'];

    // Relasi balik ke staff (one-to-many)
    public function staffs()
    {
        return $this->hasMany(Staff::class, 'role_id', 'role_id');
    }
}
