<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use App\Enums\SampleRequestStatus;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        $allowed = SampleRequestStatus::values();
        $allowedSql = "'" . implode("','", array_map(
            fn($v) => str_replace("'", "''", $v),
            $allowed
        )) . "'";

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");
        DB::statement("ALTER TABLE samples ADD CONSTRAINT chk_samples_request_status CHECK (request_status IS NULL OR request_status IN ($allowedSql))");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        $remove = [
            SampleRequestStatus::WAITING_SAMPLE_ID_ASSIGNMENT->value,
            SampleRequestStatus::SAMPLE_ID_PENDING_VERIFICATION->value,
            SampleRequestStatus::SAMPLE_ID_APPROVED_FOR_ASSIGNMENT->value,
        ];

        $allowed = array_values(array_filter(
            SampleRequestStatus::values(),
            fn($v) => !in_array($v, $remove, true)
        ));

        $allowedSql = "'" . implode("','", array_map(
            fn($v) => str_replace("'", "''", $v),
            $allowed
        )) . "'";

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");
        DB::statement("ALTER TABLE samples ADD CONSTRAINT chk_samples_request_status CHECK (request_status IS NULL OR request_status IN ($allowedSql))");
    }
};