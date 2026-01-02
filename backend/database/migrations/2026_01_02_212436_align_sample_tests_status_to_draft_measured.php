<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Safety: constraint ini spesifik PostgreSQL
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::transaction(function () {
            // 1) Drop old constraint (jika ada)
            DB::statement('ALTER TABLE sample_tests DROP CONSTRAINT IF EXISTS chk_sampletests_status;');

            // 2) Backfill data lama -> vocab baru
            DB::statement("UPDATE sample_tests SET status = 'draft' WHERE status = 'queued';");
            DB::statement("UPDATE sample_tests SET status = 'measured' WHERE status = 'testing_completed';");

            // 3) Pastikan default status jadi 'draft'
            DB::statement("ALTER TABLE sample_tests ALTER COLUMN status SET DEFAULT 'draft';");

            // 4) Add constraint baru: draft/in_progress/measured/verified/validated (+ cancelled/failed)
            DB::statement("
                ALTER TABLE sample_tests
                ADD CONSTRAINT chk_sampletests_status
                CHECK (status IN (
                    'draft',
                    'in_progress',
                    'measured',
                    'verified',
                    'validated',
                    'cancelled',
                    'failed'
                ));
            ");
        });
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::transaction(function () {
            // Drop constraint baru
            DB::statement('ALTER TABLE sample_tests DROP CONSTRAINT IF EXISTS chk_sampletests_status;');

            // Balikkan vocab agar rollback aman
            DB::statement("UPDATE sample_tests SET status = 'queued' WHERE status = 'draft';");
            DB::statement("UPDATE sample_tests SET status = 'testing_completed' WHERE status = 'measured';");

            // Balikkan default
            DB::statement("ALTER TABLE sample_tests ALTER COLUMN status SET DEFAULT 'queued';");

            // Restore constraint lama (sesuai migration existing kamu)
            DB::statement("
                ALTER TABLE sample_tests
                ADD CONSTRAINT chk_sampletests_status
                CHECK (status IN (
                    'queued',
                    'in_progress',
                    'testing_completed',
                    'verified',
                    'validated',
                    'cancelled',
                    'failed'
                ));
            ");
        });
    }
};
