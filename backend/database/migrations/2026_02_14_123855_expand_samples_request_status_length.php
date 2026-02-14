<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // VARCHAR(32) -> VARCHAR(64)
        DB::statement('ALTER TABLE samples ALTER COLUMN request_status TYPE VARCHAR(64)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE samples ALTER COLUMN request_status TYPE VARCHAR(32)');
    }
};
