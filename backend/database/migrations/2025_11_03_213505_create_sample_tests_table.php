<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('sample_tests', function (Blueprint $table) {
            // PK
            $table->bigIncrements('sample_test_id');

            // FK to samples.sample_id
            $table->unsignedBigInteger('sample_id');

            // FK to parameters.parameter_id
            $table->unsignedBigInteger('parameter_id');

            // FK to staffs.staff_id
            $table->unsignedBigInteger('assigned_to')->nullable();

            // Timing information
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();

            // Verification checkpoints
            $table->boolean('qc_done')->default(false);
            $table->boolean('om_verified')->default(false);
            $table->timestampTz('om_verified_at')->nullable();
            $table->boolean('lh_validated')->default(false);
            $table->timestampTz('lh_validated_at')->nullable();

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('sample_id', 'idx_sampletests_sample');
            $table->index('parameter_id', 'idx_sampletests_param');
            $table->index('assigned_to', 'idx_sampletests_assignee');

            // Constraints: one param/sample
            $table->unique(['sample_id', 'parameter_id'], 'uq_sampletests_sample_param');

            // FK Constraints to samples.sample_id
            $table->foreign('sample_id', 'fk_sampletests_sample')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            // FK Constraints to parameters.parameter_id
            $table->foreign('parameter_id', 'fk_sampletests_parameters')
                ->references('parameter_id')->on('parameters')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            // FK Constraints to staffs.staff_id
            $table->foreign('assigned_to', 'fk_sampletests_staffs_assignee')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
        // Boolean checks
        DB::statement(
            "ALTER TABLE sample_tests 
            ADD CONSTRAINT chk_sampletests_flag 
            CHECK (
                (qc_done IN (false,true)) AND 
                (om_verified IN (false,true)) AND 
                (lh_validated IN (false,true))
            )"
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // DROP check constraint
        DB::statement(
            "ALTER TABLE sample_tests DROP CONSTRAINT IF EXISTS chk_sampletests_flag;"
        );

        Schema::table('sample_tests', function (Blueprint $table) {
            // Drop foreign key constraints
            $table->dropForeign('fk_sampletests_samples');
            $table->dropForeign('fk_sampletests_parameters');
            $table->dropForeign('fk_sampletests_staffs_assignee');

            // Drop indexes
            $table->dropIndex('idx_sampletests_sample');
            $table->dropIndex('idx_sampletests_param');
            $table->dropIndex('idx_sampletests_assignee');

            // Drop unique constraint
            $table->dropUnique('uq_sampletests_sample_param');
        });

        Schema::dropIfExists('sample_tests');
    }
};
