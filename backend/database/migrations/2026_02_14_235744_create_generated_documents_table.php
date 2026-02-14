<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generated_documents', function (Blueprint $table) {
            $table->bigIncrements('gen_doc_id');

            $table->string('doc_code', 80);                 // ex: LOO_SURAT_PENGUJIAN
            $table->string('entity_type', 32);              // report | loo | reagent_request
            $table->unsignedBigInteger('entity_id');        // id of entity

            $table->string('record_no', 180);
            $table->string('form_code', 220);

            $table->smallInteger('revision_no')->default(0);
            $table->unsignedInteger('template_version')->default(1);

            $table->unsignedBigInteger('file_pdf_id');
            $table->unsignedBigInteger('file_docx_id')->nullable();

            $table->unsignedBigInteger('generated_by')->nullable(); // staffs.staff_id
            $table->timestamp('generated_at')->useCurrent();

            $table->boolean('is_active')->default(true);

            $table->timestamps();

            // indexes
            $table->index(['doc_code', 'is_active'], 'idx_gen_docs_code_active');
            $table->index(['entity_type', 'entity_id'], 'idx_gen_docs_entity');
            $table->index(['generated_at'], 'idx_gen_docs_generated_at');

            // FKs
            $table->foreign('file_pdf_id', 'fk_gen_docs_pdf_file')
                ->references('file_id')->on('files')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('file_docx_id', 'fk_gen_docs_docx_file')
                ->references('file_id')->on('files')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('generated_by', 'fk_gen_docs_generated_by_staff')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generated_documents');
    }
};