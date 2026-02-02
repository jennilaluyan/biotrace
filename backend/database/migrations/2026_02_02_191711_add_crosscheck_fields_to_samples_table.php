<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            // status: pending | passed | failed
            if (!Schema::hasColumn('samples', 'crosscheck_status')) {
                $table->string('crosscheck_status', 20)->default('pending');
            }

            // analyst input: kode label fisik yang ditempel di sample
            if (!Schema::hasColumn('samples', 'physical_label_code')) {
                $table->string('physical_label_code', 100)->nullable();
            }

            if (!Schema::hasColumn('samples', 'crosschecked_at')) {
                $table->timestampTz('crosschecked_at')->nullable();
            }

            if (!Schema::hasColumn('samples', 'crosschecked_by_staff_id')) {
                $table->unsignedBigInteger('crosschecked_by_staff_id')->nullable();
            }

            if (!Schema::hasColumn('samples', 'crosscheck_note')) {
                $table->text('crosscheck_note')->nullable();
            }
        });

        // Backfill aman: kalau ada record lama NULL → set pending
        DB::table('samples')
            ->whereNull('crosscheck_status')
            ->update(['crosscheck_status' => 'pending']);

        // Index ringan untuk filtering dashboard
        if (Schema::hasTable('samples')) {
            // Laravel schema builder tidak punya "hasIndex" portable; pakai raw yang aman untuk pgsql/mysql
            try {
                DB::statement('CREATE INDEX IF NOT EXISTS samples_crosscheck_status_idx ON samples (crosscheck_status)');
            } catch (\Throwable $e) {
                // fallback (misal MySQL lama tidak support IF NOT EXISTS)
            }
        }
    }

    public function down(): void
    {
        // drop index dulu kalau ada
        try {
            DB::statement('DROP INDEX IF EXISTS samples_crosscheck_status_idx');
        } catch (\Throwable $e) {
            // ignore
        }

        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasColumn('samples', 'crosscheck_note')) {
                $table->dropColumn('crosscheck_note');
            }
            if (Schema::hasColumn('samples', 'crosschecked_by_staff_id')) {
                $table->dropColumn('crosschecked_by_staff_id');
            }
            if (Schema::hasColumn('samples', 'crosschecked_at')) {
                $table->dropColumn('crosschecked_at');
            }
            if (Schema::hasColumn('samples', 'physical_label_code')) {
                $table->dropColumn('physical_label_code');
            }
            if (Schema::hasColumn('samples', 'crosscheck_status')) {
                $table->dropColumn('crosscheck_status');
            }
        });
    }
};