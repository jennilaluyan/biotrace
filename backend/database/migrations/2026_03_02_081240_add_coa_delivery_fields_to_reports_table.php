<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function pgConstraintExists(string $table, string $constraintName): bool
    {
        if (DB::getDriverName() !== 'pgsql') return false;

        $row = DB::selectOne(
            "
            select 1
            from pg_constraint c
            join pg_class r on r.oid = c.conrelid
            join pg_namespace n on n.oid = r.relnamespace
            where r.relname = ?
              and c.conname = ?
              and n.nspname = current_schema()
            limit 1
            ",
            [$table, $constraintName]
        );

        return (bool) $row;
    }

    public function up(): void
    {
        if (!Schema::hasTable('reports')) return;

        // columns (safe)
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

        // foreign keys (idempotent)
        if (!Schema::hasTable('staffs')) return;

        $hasCheckedCol = Schema::hasColumn('reports', 'coa_checked_by_staff_id');
        $hasReleasedCol = Schema::hasColumn('reports', 'coa_released_to_client_by_staff_id');

        $fkCheckedName = 'fk_reports_coa_checked_by_staff';
        $fkReleasedName = 'fk_reports_coa_released_by_staff';

        $fkCheckedExists = $this->pgConstraintExists('reports', $fkCheckedName);
        $fkReleasedExists = $this->pgConstraintExists('reports', $fkReleasedName);

        Schema::table('reports', function (Blueprint $table) use (
            $hasCheckedCol,
            $hasReleasedCol,
            $fkCheckedName,
            $fkReleasedName,
            $fkCheckedExists,
            $fkReleasedExists
        ) {
            // If you already ran migrations once (on main), these FKs might exist.
            // We only add them when they are missing.
            if ($hasCheckedCol && !$fkCheckedExists) {
                $table->foreign('coa_checked_by_staff_id', $fkCheckedName)
                    ->references('staff_id')
                    ->on('staffs')
                    ->nullOnDelete();
            }

            if ($hasReleasedCol && !$fkReleasedExists) {
                $table->foreign('coa_released_to_client_by_staff_id', $fkReleasedName)
                    ->references('staff_id')
                    ->on('staffs')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('reports')) return;

        // Drop constraints (pgsql-safe)
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

            if (Schema::hasColumn('reports', 'coa_release_note')) $table->dropColumn('coa_release_note');
            if (Schema::hasColumn('reports', 'coa_released_to_client_by_staff_id')) $table->dropColumn('coa_released_to_client_by_staff_id');
            if (Schema::hasColumn('reports', 'coa_released_to_client_at')) $table->dropColumn('coa_released_to_client_at');
            if (Schema::hasColumn('reports', 'coa_checked_by_staff_id')) $table->dropColumn('coa_checked_by_staff_id');
            if (Schema::hasColumn('reports', 'coa_checked_at')) $table->dropColumn('coa_checked_at');
        });
    }
};
