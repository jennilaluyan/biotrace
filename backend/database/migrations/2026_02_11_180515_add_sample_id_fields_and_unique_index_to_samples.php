<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'sample_id_prefix')) {
                $table->string('sample_id_prefix', 10)->nullable();
                $table->index('sample_id_prefix', 'idx_samples_sample_id_prefix');
            }

            if (!Schema::hasColumn('samples', 'sample_id_number')) {
                $table->integer('sample_id_number')->nullable();
                $table->index('sample_id_number', 'idx_samples_sample_id_number');
            }

            if (!Schema::hasColumn('samples', 'sample_id_assigned_at')) {
                $table->timestampTz('sample_id_assigned_at')->nullable();
            }

            if (!Schema::hasColumn('samples', 'sample_id_assigned_by_staff_id')) {
                $table->unsignedBigInteger('sample_id_assigned_by_staff_id')->nullable();
                $table->index('sample_id_assigned_by_staff_id', 'idx_samples_sample_id_assigned_by');

                $table->foreign('sample_id_assigned_by_staff_id', 'fk_samples_sample_id_assigned_by')
                    ->references('staff_id')->on('staffs')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            }
        });

        if (!Schema::hasColumn('samples', 'lab_sample_code')) {
            return;
        }

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                CREATE UNIQUE INDEX IF NOT EXISTS uidx_samples_lab_sample_code_not_null
                ON samples (lab_sample_code)
                WHERE lab_sample_code IS NOT NULL
            ");
            return;
        }

        try {
            Schema::table('samples', function (Blueprint $table) {
                $table->unique('lab_sample_code', 'uidx_samples_lab_sample_code');
            });
        } catch (\Throwable $e) {
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("DROP INDEX IF EXISTS uidx_samples_lab_sample_code_not_null;");
        } else {
            try {
                Schema::table('samples', function (Blueprint $table) {
                    $table->dropUnique('uidx_samples_lab_sample_code');
                });
            } catch (\Throwable $e) {
            }
        }

        Schema::table('samples', function (Blueprint $table) {
            try {
                $table->dropForeign('fk_samples_sample_id_assigned_by');
            } catch (\Throwable $e) {
            }

            try {
                $table->dropIndex('idx_samples_sample_id_assigned_by');
            } catch (\Throwable $e) {
            }

            try {
                $table->dropIndex('idx_samples_sample_id_prefix');
            } catch (\Throwable $e) {
            }

            try {
                $table->dropIndex('idx_samples_sample_id_number');
            } catch (\Throwable $e) {
            }

            if (Schema::hasColumn('samples', 'sample_id_assigned_by_staff_id')) {
                $table->dropColumn('sample_id_assigned_by_staff_id');
            }
            if (Schema::hasColumn('samples', 'sample_id_assigned_at')) {
                $table->dropColumn('sample_id_assigned_at');
            }
            if (Schema::hasColumn('samples', 'sample_id_number')) {
                $table->dropColumn('sample_id_number');
            }
            if (Schema::hasColumn('samples', 'sample_id_prefix')) {
                $table->dropColumn('sample_id_prefix');
            }
        });
    }
};