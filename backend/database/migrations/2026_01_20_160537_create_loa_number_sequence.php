<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement("CREATE SEQUENCE IF NOT EXISTS loa_number_seq START 1 INCREMENT 1 MINVALUE 1;");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement("DROP SEQUENCE IF EXISTS loa_number_seq;");
    }
};
