<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return; // constraint ini khusus postgres
        }

        DB::statement("
        ALTER TABLE samples
        DROP CONSTRAINT IF EXISTS chk_samples_lab_code_requires_verification
    ");

        /**
         * ✅ Backfill legacy rows:
         * Jika sample sudah punya lab_sample_code (berarti sudah pernah "validated" pada workflow lama),
         * tapi verified_at masih NULL, kita isi verified_at agar constraint tidak melanggar.
         *
         * Kita set ke:
         * - reviewed_at kalau ada (masuk akal sebagai waktu verifikasi/validasi),
         * - kalau tidak ada, pakai submitted_at,
         * - kalau tidak ada juga, pakai received_at,
         * - terakhir fallback: now().
         */
        DB::statement("
        UPDATE samples
        SET verified_at = COALESCE(reviewed_at, submitted_at, received_at, NOW())
        WHERE lab_sample_code IS NOT NULL
          AND verified_at IS NULL
    ");

        DB::statement("
        ALTER TABLE samples
        ADD CONSTRAINT chk_samples_lab_code_requires_verification
        CHECK (lab_sample_code IS NULL OR verified_at IS NOT NULL)
    ");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("
            ALTER TABLE samples
            DROP CONSTRAINT IF EXISTS chk_samples_lab_code_requires_verification
        ");
    }
};
