<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use App\Enums\SampleRequestStatus;

return new class extends Migration
{
    public function up(): void
    {
        // Only Postgres uses this named CHECK constraint in your project
        if (DB::getDriverName() !== 'pgsql') return;

        $allowed = SampleRequestStatus::values();
        $allowedSql = "'" . implode("','", array_map(
            fn($v) => str_replace("'", "''", $v),
            $allowed
        )) . "'";

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");

        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_request_status
            CHECK (
                request_status IS NULL OR
                request_status IN ($allowedSql)
            )
        ");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') return;

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");

        // Back to the list BEFORE Step 6B statuses existed.
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_request_status
            CHECK (
                request_status IS NULL OR
                request_status IN (
                    'draft',
                    'submitted',
                    'returned',
                    'needs_revision',
                    'ready_for_delivery',
                    'physically_received',
                    'in_transit_to_collector',
                    'under_inspection',
                    'rejected',
                    'intake_checklist_passed',
                    'intake_validated'
                )
            )
        ");
    }
};