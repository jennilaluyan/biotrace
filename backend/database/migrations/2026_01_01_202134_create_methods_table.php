<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('methods', function (Blueprint $table) {
            // PK
            $table->bigIncrements('method_id');

            // Main columns
            $table->string('name', 150);             // contoh: RT-PCR, ELISA, Sequencing
            $table->string('code', 50)->nullable();  // contoh: PCR01, ELISA-HIV
            $table->text('description')->nullable();

            // Status
            $table->boolean('is_active')->default(true);

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('is_active', 'idx_methods_active');
        });

        // UNIQUE name case-insensitive
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS uq_methods_name_ci ON methods (LOWER(name));');

        // OPTIONAL: code unique (case-insensitive) jika tidak null
        DB::statement("
            CREATE UNIQUE INDEX IF NOT EXISTS uq_methods_code_ci
            ON methods (LOWER(code))
            WHERE code IS NOT NULL;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS uq_methods_name_ci;');
        DB::statement('DROP INDEX IF EXISTS uq_methods_code_ci;');

        Schema::dropIfExists('methods');
    }
};
