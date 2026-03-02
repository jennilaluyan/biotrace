<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('reports')) return;

        Schema::table('reports', function (Blueprint $table) {
            if (!Schema::hasColumn('reports', 'coa_checked_at')) {
                $table->timestampTz('coa_checked_at')->nullable();
            }
            if (!Schema::hasColumn('reports', 'coa_checked_by_staff_id')) {
                $table->unsignedBigInteger('coa_checked_by_staff_id')->nullable();
                $table->index('coa_checked_by_staff_id', 'idx_reports_coa_checked_by');
            }

            if (!Schema::hasColumn('reports', 'coa_released_to_client_at')) {
                $table->timestampTz('coa_released_to_client_at')->nullable();
                $table->index('coa_released_to_client_at', 'idx_reports_coa_released_at');
            }
            if (!Schema::hasColumn('reports', 'coa_released_to_client_by_staff_id')) {
                $table->unsignedBigInteger('coa_released_to_client_by_staff_id')->nullable();
                $table->index('coa_released_to_client_by_staff_id', 'idx_reports_coa_released_by');
            }
            if (!Schema::hasColumn('reports', 'coa_release_note')) {
                $table->text('coa_release_note')->nullable();
            }
        });

        // Foreign keys (best-effort; safe for pgsql)
        if (Schema::hasTable('staffs')) {
            Schema::table('reports', function (Blueprint $table) {
                try {
                    if (Schema::hasColumn('reports', 'coa_checked_by_staff_id')) {
                        $table->foreign('coa_checked_by_staff_id', 'fk_reports_coa_checked_by_staff')
                            ->references('staff_id')->on('staffs')
                            ->nullOnDelete();
                    }
                } catch (\Throwable $e) {
                    // ignore if exists
                }

                try {
                    if (Schema::hasColumn('reports', 'coa_released_to_client_by_staff_id')) {
                        $table->foreign('coa_released_to_client_by_staff_id', 'fk_reports_coa_released_by_staff')
                            ->references('staff_id')->on('staffs')
                            ->nullOnDelete();
                    }
                } catch (\Throwable $e) {
                    // ignore if exists
                }
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('reports')) return;

        // Drop FKs first (pgsql-safe)
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_reports_coa_checked_by_staff");
            } catch (\Throwable $e) {
            }
            try {
                DB::statement("ALTER TABLE reports DROP CONSTRAINT IF EXISTS fk_reports_coa_released_by_staff");
            } catch (\Throwable $e) {
            }
        }

        Schema::table('reports', function (Blueprint $table) {
            // indexes
            try {
                $table->dropIndex('idx_reports_coa_checked_by');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropIndex('idx_reports_coa_released_at');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropIndex('idx_reports_coa_released_by');
            } catch (\Throwable $e) {
            }

            // columns
            if (Schema::hasColumn('reports', 'coa_release_note')) $table->dropColumn('coa_release_note');
            if (Schema::hasColumn('reports', 'coa_released_to_client_by_staff_id')) $table->dropColumn('coa_released_to_client_by_staff_id');
            if (Schema::hasColumn('reports', 'coa_released_to_client_at')) $table->dropColumn('coa_released_to_client_at');
            if (Schema::hasColumn('reports', 'coa_checked_by_staff_id')) $table->dropColumn('coa_checked_by_staff_id');
            if (Schema::hasColumn('reports', 'coa_checked_at')) $table->dropColumn('coa_checked_at');
        });
    }
};
