<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('documents')) {
            return;
        }

        $hasDocCode = Schema::hasColumn('documents', 'doc_code');
        $hasKind = Schema::hasColumn('documents', 'kind');
        $hasRecordPrefix = Schema::hasColumn('documents', 'record_no_prefix');
        $hasFormPrefix = Schema::hasColumn('documents', 'form_code_prefix');
        $hasRevisionNo = Schema::hasColumn('documents', 'revision_no');
        $hasIsActive = Schema::hasColumn('documents', 'is_active');

        Schema::table('documents', function (Blueprint $table) use (
            $hasDocCode,
            $hasKind,
            $hasRecordPrefix,
            $hasFormPrefix,
            $hasRevisionNo,
            $hasIsActive
        ) {
            // Identifier for template registry (nullable for legacy docs)
            if (!$hasDocCode) {
                $table->string('doc_code', 80)->nullable();
                $table->unique('doc_code', 'uq_documents_doc_code');
            }

            // template | general (default general so existing rows are safe)
            if (!$hasKind) {
                $table->string('kind', 16)->default('general');
            }

            // Numbering prefixes (only meaningful for templates)
            if (!$hasRecordPrefix) {
                $table->string('record_no_prefix', 160)->nullable();
            }
            if (!$hasFormPrefix) {
                $table->string('form_code_prefix', 200)->nullable();
            }

            // RevXX (editable admin, separate from document_versions.version_no)
            if (!$hasRevisionNo) {
                $table->smallInteger('revision_no')->default(0);
            }

            if (!$hasIsActive) {
                $table->boolean('is_active')->default(true);
            }
        });

        // Constraints (Postgres only) — pakai try/catch biar deploy tidak jebol kalau sudah ada
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("
                    ALTER TABLE documents
                    ADD CONSTRAINT chk_documents_kind
                    CHECK (kind IN ('general', 'template'))
                ");
            } catch (\Throwable $e) {
                // ignore
            }

            try {
                DB::statement("
                    ALTER TABLE documents
                    ADD CONSTRAINT chk_documents_revision_nonneg
                    CHECK (revision_no >= 0)
                ");
            } catch (\Throwable $e) {
                // ignore
            }
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('documents')) {
            return;
        }

        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("ALTER TABLE documents DROP CONSTRAINT IF EXISTS chk_documents_kind");
            } catch (\Throwable $e) {
            }
            try {
                DB::statement("ALTER TABLE documents DROP CONSTRAINT IF EXISTS chk_documents_revision_nonneg");
            } catch (\Throwable $e) {
            }
        }

        Schema::table('documents', function (Blueprint $table) {
            // drop unique first
            try {
                $table->dropUnique('uq_documents_doc_code');
            } catch (\Throwable $e) {
            }

            foreach (['doc_code', 'kind', 'record_no_prefix', 'form_code_prefix', 'revision_no', 'is_active'] as $col) {
                if (Schema::hasColumn('documents', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};