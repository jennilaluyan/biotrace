<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // This constraint exists in PostgreSQL. On sqlite/mysql it may not exist or may differ.
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Drop old constraint (does NOT include in_transit_to_collector)
        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");

        // Recreate constraint with the new allowed value included
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_request_status
            CHECK (
                request_status IN (
                    'draft',
                    'submitted',
                    'returned',
                    'needs_revision',
                    'ready_for_delivery',
                    'physically_received',
                    'in_transit_to_collector',
                    'rejected',
                    'intake_checklist_passed',
                    'intake_validated'
                )
            )
        ");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");

        // Recreate original set (without in_transit_to_collector)
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_request_status
            CHECK (
                request_status IN (
                    'draft',
                    'submitted',
                    'returned',
                    'needs_revision',
                    'ready_for_delivery',
                    'physically_received',
                    'rejected',
                    'intake_checklist_passed',
                    'intake_validated'
                )
            )
        ");
    }
};