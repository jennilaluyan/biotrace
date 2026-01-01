<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reagents', function (Blueprint $table) {
            // PK
            $table->bigIncrements('reagent_id');

            // Master identity
            $table->string('code', 50)->nullable();   // optional internal code
            $table->string('name', 150);             // reagent name (unique CI)
            $table->text('description')->nullable();

            // optional default unit for stock usage (e.g. mL, µL, mg)
            $table->unsignedBigInteger('unit_id')->nullable();

            // status
            $table->boolean('is_active')->default(true);

            // audit fields
            $table->unsignedBigInteger('created_by'); // staff_id
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // indexes
            $table->index('unit_id', 'idx_reagents_unit');
            $table->index('created_by', 'idx_reagents_created_by');
            $table->index('is_active', 'idx_reagents_active');

            // FK constraints
            $table->foreign('unit_id', 'fk_reagents_units')
                ->references('unit_id')->on('units')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            $table->foreign('created_by', 'fk_reagents_staffs_creator')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // Unique case-insensitive (PostgreSQL)
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS uq_reagents_name_ci ON reagents (LOWER(name));');
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS uq_reagents_code_ci ON reagents (LOWER(code)) WHERE code IS NOT NULL;');
    }

    public function down(): void
    {
        // Drop FKs & indexes (Laravel-level)
        Schema::table('reagents', function (Blueprint $table) {
            $table->dropForeign('fk_reagents_units');
            $table->dropForeign('fk_reagents_staffs_creator');

            $table->dropIndex('idx_reagents_unit');
            $table->dropIndex('idx_reagents_created_by');
            $table->dropIndex('idx_reagents_active');
        });

        Schema::dropIfExists('reagents');
    }
};
