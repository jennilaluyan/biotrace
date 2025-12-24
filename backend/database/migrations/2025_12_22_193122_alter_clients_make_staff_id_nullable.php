<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // staff_id wajib untuk client yg dibuat staff (backoffice),
        // tapi untuk client register dari portal harus boleh NULL dulu.
        DB::statement('ALTER TABLE clients ALTER COLUMN staff_id DROP NOT NULL');
    }

    public function down(): void
    {
        // rollback: hati-hati kalau sudah ada row staff_id NULL.
        // kalau tetap mau, pastikan dulu tidak ada NULL sebelum migrate down.
        DB::statement('ALTER TABLE clients ALTER COLUMN staff_id SET NOT NULL');
    }
};
