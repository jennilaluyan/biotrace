<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('reagent_calculations')) {
            return;
        }

        // Backfill: if not OM-approved, it must not be locked (so engine can compute)
        if (Schema::hasColumn('reagent_calculations', 'locked')) {
            // Prefer om_approved_by if exists; fallback to om_approved_at if that exists
            $hasApprovedBy = Schema::hasColumn('reagent_calculations', 'om_approved_by');
            $hasApprovedAt = Schema::hasColumn('reagent_calculations', 'om_approved_at');

            if ($hasApprovedBy) {
                DB::table('reagent_calculations')
                    ->whereNull('om_approved_by')
                    ->update(['locked' => 0]);
            } elseif ($hasApprovedAt) {
                DB::table('reagent_calculations')
                    ->whereNull('om_approved_at')
                    ->update(['locked' => 0]);
            } else {
                // If approval columns do not exist, just unlock all to avoid engine deadlock.
                DB::table('reagent_calculations')->update(['locked' => 0]);
            }

            // Set DB default to false if driver supports ALTER easily.
            $driver = DB::getDriverName();

            try {
                if ($driver === 'mysql') {
                    // boolean is typically tinyint(1)
                    DB::statement("ALTER TABLE reagent_calculations MODIFY locked TINYINT(1) NOT NULL DEFAULT 0");
                } elseif ($driver === 'pgsql') {
                    DB::statement("ALTER TABLE reagent_calculations ALTER COLUMN locked SET DEFAULT false");
                    DB::statement("ALTER TABLE reagent_calculations ALTER COLUMN locked SET NOT NULL");
                } elseif ($driver === 'sqlite') {
                    // SQLite can't reliably alter column default without table rebuild.
                    // We already backfilled existing rows; for new rows ensure app sets locked=false.
                }
            } catch (\Throwable $e) {
                // Do not break migration just because ALTER differs per DB.
                // Backfill already prevents engine deadlock.
            }
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('reagent_calculations')) {
            return;
        }

        if (!Schema::hasColumn('reagent_calculations', 'locked')) {
            return;
        }

        $driver = DB::getDriverName();

        try {
            if ($driver === 'mysql') {
                DB::statement("ALTER TABLE reagent_calculations MODIFY locked TINYINT(1) NOT NULL DEFAULT 1");
            } elseif ($driver === 'pgsql') {
                DB::statement("ALTER TABLE reagent_calculations ALTER COLUMN locked SET DEFAULT true");
            } elseif ($driver === 'sqlite') {
                // no-op (can't reliably revert default without rebuild)
            }
        } catch (\Throwable $e) {
            // no-op
        }
    }
};