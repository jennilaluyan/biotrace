<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sample_tests', function (Blueprint $table) {
            $table->bigIncrements('sample_test_id');

            $table->unsignedBigInteger('sample_id');
            $table->unsignedBigInteger('parameter_id');
            $table->unsignedBigInteger('assigned_to')->nullable(); // staff_id (Analyst)

            // Waktu dan status eksekusi
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();

            // Checkpoint QC & approval
            $table->boolean('qc_done')->default(false);
            $table->boolean('om_verified')->default(false);
            $table->timestampTz('om_verified_at')->nullable();
            $table->boolean('lh_validated')->default(false);
            $table->timestampTz('lh_validated_at')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('sample_id', 'idx_sampletests_sample');
            $table->index('parameter_id', 'idx_sampletests_param');
            $table->index('assigned_to', 'idx_sampletests_assignee');

            // Satu parameter per sample per baris
            $table->unique(['sample_id', 'parameter_id'], 'uq_sampletests_sample_param');

            // FK
            $table->foreign('sample_id', 'fk_sampletests_sample')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('parameter_id', 'fk_sampletests_parameters')
                ->references('parameter_id')->on('parameters')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('assigned_to', 'fk_sampletests_staffs_assignee')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        DB::statement("
            ALTER TABLE sample_tests
            ADD CONSTRAINT chk_sampletests_flag
            CHECK (
                (qc_done IN (false,true)) AND
                (om_verified IN (false,true)) AND
                (lh_validated IN (false,true))
            );
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE sample_tests DROP CONSTRAINT IF EXISTS chk_sampletests_flag;');

        Schema::table('sample_tests', function (Blueprint $table) {
            $table->dropForeign('fk_sampletests_sample');
            $table->dropForeign('fk_sampletests_parameters');
            $table->dropForeign('fk_sampletests_staffs_assignee');

            $table->dropIndex('idx_sampletests_sample');
            $table->dropIndex('idx_sampletests_param');
            $table->dropIndex('idx_sampletests_assignee');

            $table->dropUnique('uq_sampletests_sample_param');
        });

        Schema::dropIfExists('sample_tests');
    }
};
