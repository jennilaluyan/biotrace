<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Prefer raw SQL biar gak butuh doctrine/dbal
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(120)");
        } elseif ($driver === 'mysql') {
            DB::statement("ALTER TABLE audit_logs MODIFY action VARCHAR(120)");
        } else {
            // fallback best-effort
            DB::statement("ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(120)");
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(40)");
        } elseif ($driver === 'mysql') {
            DB::statement("ALTER TABLE audit_logs MODIFY action VARCHAR(40)");
        } else {
            DB::statement("ALTER TABLE audit_logs ALTER COLUMN action TYPE VARCHAR(40)");
        }
    }
};
