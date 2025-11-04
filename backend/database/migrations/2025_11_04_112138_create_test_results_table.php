<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('test_results', function (Blueprint $table) {
            // PK
            $table->bigIncrements('result_id');

            // Parent Linkage
            $table->unsignedBigInteger('sample_test_id');
            $table->unsignedBigInteger('created_by');

            // Result Payloads
            $table->json('raw_data');
            $table->json('calc_data');
            $table->text('interpretation');
            $table->integer('version_no')->default(1);

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('sample_test_id', 'idx_results_sampletest');
            $table->index('created_by', 'idx_results_creator');

            // FK
            $table->foreign('sample_test_id', 'fk_results_sampletests')
                ->references('sample_test_id')->on('sample_tests')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('created_by', 'fk_results_staffs_creator')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('test_results', function (Blueprint $table) {
            // Drop FK Constraints
            $table->dropForeign('fk_results_sampletests');
            $table->dropForeign('fk_results_staffs_creator');
            $table->dropIndex('idx_results_sampletest');
            $table->dropIndex('idx_results_creator');
        });

        Schema::dropIfExists('test_results');
    }
};
