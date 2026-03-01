<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('quality_covers') || !Schema::hasTable('files')) return;

        if (!Schema::hasTable('quality_cover_supporting_files')) {
            Schema::create('quality_cover_supporting_files', function (Blueprint $table) {
                $table->bigIncrements('id');

                $table->unsignedBigInteger('quality_cover_id');
                $table->unsignedBigInteger('file_id');

                // optional traceability
                $table->unsignedBigInteger('created_by_staff_id')->nullable();

                $table->timestampTz('created_at')->useCurrent();
                $table->timestampTz('updated_at')->nullable();

                $table->unique(['quality_cover_id', 'file_id'], 'uq_qc_supporting_files');

                $table->index('quality_cover_id', 'idx_qc_supporting_files_qc');
                $table->index('file_id', 'idx_qc_supporting_files_file');
                $table->index('created_by_staff_id', 'idx_qc_supporting_files_creator');

                $table->foreign('quality_cover_id', 'fk_qc_supporting_files_qc')
                    ->references('quality_cover_id')->on('quality_covers')
                    ->cascadeOnUpdate()
                    ->cascadeOnDelete();

                $table->foreign('file_id', 'fk_qc_supporting_files_file')
                    ->references('file_id')->on('files')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();

                $table->foreign('created_by_staff_id', 'fk_qc_supporting_files_staff')
                    ->references('staff_id')->on('staffs')
                    ->cascadeOnUpdate()
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('quality_cover_supporting_files')) return;

        Schema::table('quality_cover_supporting_files', function (Blueprint $table) {
            try {
                $table->dropForeign('fk_qc_supporting_files_qc');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropForeign('fk_qc_supporting_files_file');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropForeign('fk_qc_supporting_files_staff');
            } catch (\Throwable $e) {
            }

            try {
                $table->dropUnique('uq_qc_supporting_files');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropIndex('idx_qc_supporting_files_qc');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropIndex('idx_qc_supporting_files_file');
            } catch (\Throwable $e) {
            }
            try {
                $table->dropIndex('idx_qc_supporting_files_creator');
            } catch (\Throwable $e) {
            }
        });

        Schema::dropIfExists('quality_cover_supporting_files');
    }
};
