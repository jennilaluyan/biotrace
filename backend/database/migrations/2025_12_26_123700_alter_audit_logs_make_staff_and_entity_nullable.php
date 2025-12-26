<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // PostgreSQL: allow NULL for events where actor/entity is not yet known (e.g., LOGIN_FAILURE)
        DB::statement('ALTER TABLE audit_logs ALTER COLUMN staff_id DROP NOT NULL;');
        DB::statement('ALTER TABLE audit_logs ALTER COLUMN entity_id DROP NOT NULL;');
    }

    public function down(): void
    {
        // Rollback: WARNING — make sure there is no NULL data before setting NOT NULL back
        DB::statement('ALTER TABLE audit_logs ALTER COLUMN staff_id SET NOT NULL;');
        DB::statement('ALTER TABLE audit_logs ALTER COLUMN entity_id SET NOT NULL;');
    }
};
