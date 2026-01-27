<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Enums\SampleRequestStatus;

return new class extends Migration
{
    public function up(): void
    {
        // Only for Postgres (constraint named). Other drivers often don't support drop/add easily.
        if (DB::getDriverName() !== 'pgsql') return;

        $allowed = SampleRequestStatus::values(); // array of strings
        $allowedSql = "'" . implode("','", array_map(fn($v) => str_replace("'", "''", $v), $allowed)) . "'";

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");
        DB::statement("ALTER TABLE samples ADD CONSTRAINT chk_samples_request_status CHECK (request_status IS NULL OR request_status IN ($allowedSql))");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        // Best-effort rollback: remove constraint and recreate without UNDER_INSPECTION
        $allowed = array_values(array_filter(
            SampleRequestStatus::values(),
            fn($v) => $v !== SampleRequestStatus::UNDER_INSPECTION->value
        ));

        $allowedSql = "'" . implode("','", array_map(fn($v) => str_replace("'", "''", $v), $allowed)) . "'";

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");
        DB::statement("ALTER TABLE samples ADD CONSTRAINT chk_samples_request_status CHECK (request_status IS NULL OR request_status IN ($allowedSql))");
    }
};