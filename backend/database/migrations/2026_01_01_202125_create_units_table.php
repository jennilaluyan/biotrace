<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table) {
            // PK
            $table->bigIncrements('unit_id');

            // Main columns
            $table->string('name', 100);         // contoh: Copy/µL, Nanogram/mL
            $table->string('symbol', 30)->nullable(); // contoh: µL, ng/mL
            $table->text('description')->nullable();

            // Status
            $table->boolean('is_active')->default(true);

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('is_active', 'idx_units_active');
        });

        // UNIQUE name case-insensitive
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS uq_units_name_ci ON units (LOWER(name));');

        // OPTIONAL: symbol unique (case-insensitive) jika tidak null
        DB::statement("
            CREATE UNIQUE INDEX IF NOT EXISTS uq_units_symbol_ci
            ON units (LOWER(symbol))
            WHERE symbol IS NOT NULL;
        ");
    }

    public function down(): void
    {
        // Drop indexes dibuat via DB::statement (kalau ada)
        DB::statement('DROP INDEX IF EXISTS uq_units_name_ci;');
        DB::statement('DROP INDEX IF EXISTS uq_units_symbol_ci;');

        Schema::dropIfExists('units');
    }
};
