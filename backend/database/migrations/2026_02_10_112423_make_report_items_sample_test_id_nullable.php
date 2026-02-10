<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('report_items') || !Schema::hasColumn('report_items', 'sample_test_id')) {
            return;
        }

        $driver = DB::getDriverName();

        // ✅ PostgreSQL: easy, no type needed
        if ($driver === 'pgsql') {
            DB::statement("ALTER TABLE report_items ALTER COLUMN sample_test_id DROP NOT NULL");
            return;
        }

        // ✅ MySQL: need exact column type, fetch from information_schema
        if ($driver === 'mysql') {
            $row = DB::selectOne("
                SELECT COLUMN_TYPE AS column_type
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'report_items'
                  AND COLUMN_NAME = 'sample_test_id'
                LIMIT 1
            ");

            $colType = $row?->column_type ?: 'bigint unsigned';
            DB::statement("ALTER TABLE report_items MODIFY sample_test_id {$colType} NULL");
            return;
        }

        // ✅ SQLite: rebuild table using sqlite_master SQL (preserve schema as much as possible)
        if ($driver === 'sqlite') {
            // already nullable?
            $info = DB::select("PRAGMA table_info('report_items')");
            foreach ($info as $c) {
                if ((string)($c->name ?? '') === 'sample_test_id') {
                    // notnull: 1 = NOT NULL, 0 = nullable
                    if ((int)($c->notnull ?? 0) === 0) return;
                }
            }

            $tableRow = DB::selectOne("
                SELECT sql
                FROM sqlite_master
                WHERE type = 'table' AND name = 'report_items'
                LIMIT 1
            ");

            $createSql = (string)($tableRow->sql ?? '');
            if (trim($createSql) === '') return;

            // capture indexes to recreate
            $idxRows = DB::select("
                SELECT sql
                FROM sqlite_master
                WHERE type = 'index'
                  AND tbl_name = 'report_items'
                  AND sql IS NOT NULL
            ");
            $indexSqls = array_values(array_filter(array_map(fn($r) => (string)($r->sql ?? ''), $idxRows)));

            $tmp = 'report_items__tmp';

            // rename CREATE TABLE report_items -> CREATE TABLE report_items__tmp
            $tmpSql = preg_replace(
                '/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?report_items"?)/i',
                "CREATE TABLE {$tmp}",
                $createSql,
                1
            );

            // remove NOT NULL only for sample_test_id column definition
            $tmpSql = preg_replace('/(\bsample_test_id\b[^,]*?)\bNOT\s+NULL\b/i', '$1', $tmpSql);

            DB::statement('PRAGMA foreign_keys=OFF');

            // create tmp table
            DB::statement($tmpSql);

            // copy data by columns
            $cols = DB::select("PRAGMA table_info('report_items')");
            $names = array_map(fn($c) => (string)$c->name, $cols);
            $quoted = implode(', ', array_map(fn($c) => '"' . str_replace('"', '""', $c) . '"', $names));

            DB::statement("INSERT INTO {$tmp} ({$quoted}) SELECT {$quoted} FROM report_items");

            DB::statement("DROP TABLE report_items");
            DB::statement("ALTER TABLE {$tmp} RENAME TO report_items");

            // recreate indexes
            foreach ($indexSqls as $sql) {
                DB::statement($sql);
            }

            DB::statement('PRAGMA foreign_keys=ON');
            return;
        }

        // other drivers: do nothing (safe)
    }

    public function down(): void
    {
        // no-op (avoid breaking existing data)
    }
};
