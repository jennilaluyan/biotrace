<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reagent_calculations', function (Blueprint $table) {
            // Primary key
            $table->bigIncrements('calc_id');

            // Linkage 
            $table->unsignedBigInteger('sample_id');
            $table->unsignedBigInteger('computed_by');
            $table->unsignedBigInteger('edited_by')->nullable();
            $table->unsignedBigInteger('om_approved_by')->nullable();

            // Calculation payload
            $table->json('payload');
            $table->boolean('locked')->default(true);

            // Timeline stamps
            $table->timestampTz('computed_at')->useCurrent();
            $table->timestampTz('edited_at')->nullable();

            // System timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->unique('sample_id', 'uq_reagcalc_sample');
            $table->index('sample_id', 'idx_reagcalc_sample');
            $table->index('computed_by', 'idx_reagcalc_computed_by');
            $table->index('edited_by', 'idx_reagcalc_edited_by');
            $table->index('om_approved_by', 'idx_reagcalc_om_approved_by');

            // FK
            $table->foreign('sample_id', 'fk_reagcalc_samples')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('computed_by', 'fk_reagcalc_staffs_computed')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('edited_by', 'fk_reagcalc_staffs_edited')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            $table->foreign('om_approved_by', 'fk_reagcalc_staffs_om')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // Boolean check
        DB::statement(
            "ALTER TABLE reagent_calculations
             ADD CONSTRAINT chk_reagcalc_locked
             CHECK (locked IN (false,true))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE reagent_calculations DROP CONSTRAINT IF EXISTS chk_reagcalc_locked;');

        Schema::table('reagent_calculations', function (Blueprint $table) {
            $table->dropForeign('fk_reagcalc_samples');
            $table->dropForeign('fk_reagcalc_staffs_computed');
            $table->dropForeign('fk_reagcalc_staffs_edited');
            $table->dropForeign('fk_reagcalc_staffs_om');

            $table->dropUnique('uq_reagcalc_sample');
            $table->dropIndex('idx_reagcalc_sample');
            $table->dropIndex('idx_reagcalc_computed_by');
            $table->dropIndex('idx_reagcalc_edited_by');
            $table->dropIndex('idx_reagcalc_om_approved_by');
        });

        Schema::dropIfExists('reagent_calculations');
    }
};
