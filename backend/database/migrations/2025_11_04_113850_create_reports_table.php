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
        Schema::create('reports', function (Blueprint $table) {
            // PK
            $table->bigIncrements('report_id');

            // One-to-one with samples
            $table->unsignedBigInteger('sample_id');
            $table->string('report_no', 60)->unique();

            // Generation metadata
            $table->timestampTz('generated_at');
            $table->unsignedBigInteger('generated_by');

            // Artifact location
            $table->text('pdf_url');

            // Locking
            $table->boolean('is_locked')->default(false);

            // System timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->unique('sample_id', 'uq_reports_sample');
            $table->index('generated_by', 'idx_reports_generator');

            // FK
            $table->foreign('sample_id', 'fk_reports_samples')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('generated_by', 'fk_reports_staffs_generator')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // CHECK Constraint for clarity
        DB::statement(
            "ALTER TABLE reports 
            ADD CONSTRAINT chk_reports_locked 
            CHECK (is_locked IN (false, true))"
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement(
            "ALTER TABLE reports 
            DROP CONSTRAINT IF EXISTS chk_reports_locked"
        );

        Schema::table('reports', function (Blueprint $table) {
            $table->dropForeign('fk_reports_samples');
            $table->dropForeign('fk_reports_staffs_generator');
            $table->dropUnique('uq_reports_sample');
            $table->dropIndex('idx_reports_generator');
        });

        Schema::dropIfExists('reports');
    }
};
