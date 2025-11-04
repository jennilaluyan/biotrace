<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_versions', function (Blueprint $table) {
            // Primary key
            $table->bigIncrements('doc_ver_id');

            // Relationships
            $table->unsignedBigInteger('doc_id');
            $table->integer('version_no');
            $table->unsignedBigInteger('uploaded_by');

            // Metadata
            $table->timestampTz('uploaded_at')->useCurrent();
            $table->text('changelog');

            // System timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->unique(['doc_id', 'version_no'], 'uq_docver_doc_version');
            $table->index('uploaded_by', 'idx_docver_uploader');

            // Foreign keys
            $table->foreign('doc_id', 'fk_docver_documents')
                ->references('doc_id')->on('documents')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('uploaded_by', 'fk_docver_staffs_uploader')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        DB::statement(
            "ALTER TABLE document_versions
             ADD CONSTRAINT chk_docver_version_positive
             CHECK (version_no > 0)"
        );

        Schema::table('documents', function (Blueprint $table) {
            $table->foreign('version_current_id', 'fk_docs_current_version')
                ->references('doc_ver_id')->on('document_versions')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropForeign('fk_docs_current_version');
        });

        DB::statement('ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS chk_docver_version_positive;');

        Schema::table('document_versions', function (Blueprint $table) {
            $table->dropForeign('fk_docver_documents');
            $table->dropForeign('fk_docver_staffs_uploader');
            $table->dropUnique('uq_docver_doc_version');
            $table->dropIndex('idx_docver_uploader');
        });

        Schema::dropIfExists('document_versions');
    }
};
