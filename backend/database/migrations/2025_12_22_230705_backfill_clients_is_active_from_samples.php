<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Aktifkan client legacy yang sudah punya sample
        DB::statement("
            UPDATE clients
            SET is_active = TRUE
            WHERE deleted_at IS NULL
              AND (is_active IS NULL OR is_active = FALSE)
              AND EXISTS (
                  SELECT 1 FROM samples s
                  WHERE s.client_id = clients.client_id
              )
        ");
    }

    public function down(): void
    {
        // biasanya gak perlu rollback untuk backfill data
    }
};
