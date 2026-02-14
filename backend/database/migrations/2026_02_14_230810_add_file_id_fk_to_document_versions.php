<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('document_versions') || !Schema::hasTable('files')) {
            return;
        }

        $needsCol = !Schema::hasColumn('document_versions', 'file_id');

        Schema::table('document_versions', function (Blueprint $table) use ($needsCol) {
            if ($needsCol) {
                // nullable dulu biar tidak ngebunuh environment yang sudah punya versi lama
                $table->unsignedBigInteger('file_id')->nullable();
                $table->index('file_id', 'idx_docver_file_id');
            }
        });

        // Add FK (idempotent-ish)
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("
                    ALTER TABLE document_versions
                    ADD CONSTRAINT fk_docver_files_file_id
                    FOREIGN KEY (file_id)
                    REFERENCES files(file_id)
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT
                ");
            } catch (\Throwable $e) {
                // ignore (constraint sudah ada / beda env)
            }

            // Safety: pastikan FK current version tetap ada (di project kamu ini sudah dibuat sebelumnya)
            if (Schema::hasTable('documents') && Schema::hasColumn('documents', 'version_current_id')) {
                try {
                    DB::statement("
                        ALTER TABLE documents
                        ADD CONSTRAINT fk_docs_current_version
                        FOREIGN KEY (version_current_id)
                        REFERENCES document_versions(doc_ver_id)
                        ON UPDATE CASCADE
                        ON DELETE SET NULL
                    ");
                } catch (\Throwable $e) {
                    // ignore
                }
            }
        } else {
            // non-pg fallback (kalau suatu saat env beda)
            Schema::table('document_versions', function (Blueprint $table) {
                if (Schema::hasColumn('document_versions', 'file_id')) {
                    try {
                        $table->foreign('file_id', 'fk_docver_files_file_id')
                            ->references('file_id')->on('files')
                            ->cascadeOnUpdate()
                            ->restrictOnDelete();
                    } catch (\Throwable $e) {
                        // ignore
                    }
                }
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('document_versions')) {
            return;
        }

        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS fk_docver_files_file_id");
            } catch (\Throwable $e) {
                // ignore
            }
            // Jangan drop fk_docs_current_version di down (itu FK “lama” yang memang bagian dari system)
        }

        Schema::table('document_versions', function (Blueprint $table) {
            if (Schema::hasColumn('document_versions', 'file_id')) {
                try {
                    $table->dropIndex('idx_docver_file_id');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropForeign('fk_docver_files_file_id');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('file_id');
            }
        });
    }
};