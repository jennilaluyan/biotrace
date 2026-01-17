<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        // Drop old constraint (if exists), then re-add with expanded allowed statuses
        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_status");

        // Sesuaikan daftar status lab workflow kamu yang sudah dipakai oleh SampleStatusTransitionApiTest
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_status
            CHECK (current_status IN (
                'Active',
                'received',
                'in_progress',
                'testing_completed',
                'verified',
                'validated',
                'reported'
            ))
        ");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_status");

        // balik ke versi tanpa 'Active' (kalau sebelumnya begitu)
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_status
            CHECK (current_status IN (
                'received',
                'in_progress',
                'testing_completed',
                'verified',
                'validated',
                'reported'
            ))
        ");
    }
};
