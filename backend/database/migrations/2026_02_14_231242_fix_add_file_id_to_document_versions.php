<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // defensive: some env might have typos or different naming
        $tableName = null;
        if (Schema::hasTable('document_versions')) $tableName = 'document_versions';
        else if (Schema::hasTable('document_verisons')) $tableName = 'document_verisons'; // just in case

        if (!$tableName || !Schema::hasTable('files')) {
            return;
        }

        // 1) ensure column exists
        if (!Schema::hasColumn($tableName, 'file_id')) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->unsignedBigInteger('file_id')->nullable();
                $table->index('file_id', 'idx_docver_file_id');
            });
        }

        // 2) ensure FK exists (Postgres)
        if (DB::getDriverName() === 'pgsql') {
            $exists = DB::selectOne("
                select 1
                from pg_constraint
                where conname = 'fk_docver_files_file_id'
                limit 1
            ");

            if (!$exists) {
                DB::statement("
                    ALTER TABLE {$tableName}
                    ADD CONSTRAINT fk_docver_files_file_id
                    FOREIGN KEY (file_id)
                    REFERENCES files(file_id)
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT
                ");
            }
        }
    }

    public function down(): void
    {
        $tableName = null;
        if (Schema::hasTable('document_versions')) $tableName = 'document_versions';
        else if (Schema::hasTable('document_verisons')) $tableName = 'document_verisons';

        if (!$tableName) return;

        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement("ALTER TABLE {$tableName} DROP CONSTRAINT IF EXISTS fk_docver_files_file_id");
            } catch (\Throwable $e) {
            }
        }

        if (Schema::hasColumn($tableName, 'file_id')) {
            Schema::table($tableName, function (Blueprint $table) {
                try {
                    $table->dropIndex('idx_docver_file_id');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropForeign(['file_id']);
                } catch (\Throwable $e) {
                }
                $table->dropColumn('file_id');
            });
        }
    }
};