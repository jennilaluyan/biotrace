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
            if (!Schema::hasColumn('samples', 'test_method_id')) {
                $table->unsignedBigInteger('test_method_id')->nullable()->after('workflow_group');
                $table->index('test_method_id', 'idx_samples_test_method_id');
            }

            if (!Schema::hasColumn('samples', 'test_method_name')) {
                $table->string('test_method_name', 255)->nullable()->after('test_method_id');
            }

            if (!Schema::hasColumn('samples', 'test_method_set_by_staff_id')) {
                $table->unsignedBigInteger('test_method_set_by_staff_id')->nullable()->after('test_method_name');
            }

            if (!Schema::hasColumn('samples', 'test_method_set_at')) {
                $table->timestampTz('test_method_set_at')->nullable()->after('test_method_set_by_staff_id');
            }
        });

        // FK best-effort (avoid blowing up on weird envs)
        if (
            Schema::hasTable('methods') &&
            Schema::hasColumn('methods', 'method_id') &&
            Schema::hasColumn('samples', 'test_method_id')
        ) {
            try {
                Schema::table('samples', function (Blueprint $table) {
                    // default laravel name: samples_test_method_id_foreign
                    $table->foreign('test_method_id')
                        ->references('method_id')
                        ->on('methods')
                        ->nullOnDelete();
                });
            } catch (\Throwable) {
                // ignore: FK might already exist or driver doesn't support
            }
        }

        /**
         * Backfill (legacy safety):
         * Existing samples that already rely on workflow_group for LOO should not break.
         * We fill test_method_name from workflow_group only when it's still NULL/empty.
         */
        if (Schema::hasColumn('samples', 'test_method_name') && Schema::hasColumn('samples', 'workflow_group')) {
            $driver = DB::getDriverName();

            // Use SQL CASE to do bulk backfill efficiently
            $sql = "
                UPDATE samples
                SET test_method_name = CASE
                    WHEN (test_method_name IS NULL OR test_method_name = '') AND workflow_group = 'pcr_sars_cov_2' THEN 'PCR SARS-CoV-2'
                    WHEN (test_method_name IS NULL OR test_method_name = '') AND workflow_group = 'pcr' THEN 'PCR'
                    WHEN (test_method_name IS NULL OR test_method_name = '') AND workflow_group = 'wgs' THEN 'Whole Genome Sequencing (WGS)'
                    WHEN (test_method_name IS NULL OR test_method_name = '') AND workflow_group = 'elisa' THEN 'ELISA'
                    ELSE test_method_name
                END
            ";

            try {
                DB::statement($sql);
            } catch (\Throwable) {
                // ignore: best-effort only
            }
        }
    }

    public function down(): void
    {
        // Drop FK best-effort
        if (Schema::hasColumn('samples', 'test_method_id')) {
            try {
                Schema::table('samples', function (Blueprint $table) {
                    try {
                        $table->dropForeign(['test_method_id']);
                    } catch (\Throwable) {
                        // ignore
                    }
                });
            } catch (\Throwable) {
                // ignore
            }
        }

        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasColumn('samples', 'test_method_set_at')) {
                $table->dropColumn('test_method_set_at');
            }
            if (Schema::hasColumn('samples', 'test_method_set_by_staff_id')) {
                $table->dropColumn('test_method_set_by_staff_id');
            }
            if (Schema::hasColumn('samples', 'test_method_name')) {
                $table->dropColumn('test_method_name');
            }
            if (Schema::hasColumn('samples', 'test_method_id')) {
                $table->dropIndex('idx_samples_test_method_id');
                $table->dropColumn('test_method_id');
            }
        });
    }
};
