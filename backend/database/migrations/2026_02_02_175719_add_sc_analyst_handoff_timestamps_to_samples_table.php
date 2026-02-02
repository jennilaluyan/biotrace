<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * PG-only: check if an index exists.
     */
    private function indexExists(string $table, string $indexName): bool
    {
        try {
            if (DB::getDriverName() !== 'pgsql') return false;

            $row = DB::selectOne(
                "SELECT 1
                 FROM pg_indexes
                 WHERE schemaname = ANY (current_schemas(false))
                   AND tablename = ?
                   AND indexname = ?
                 LIMIT 1",
                [$table, $indexName]
            );

            return $row !== null;
        } catch (\Throwable $e) {
            // fail-open
            return false;
        }
    }

    private function addIndexIfMissing(string $table, string $column, string $indexName): void
    {
        if (!Schema::hasColumn($table, $column)) return;
        if ($this->indexExists($table, $indexName)) return;

        Schema::table($table, function (Blueprint $t) use ($column, $indexName) {
            $t->index($column, $indexName);
        });
    }

    private function dropIndexIfExists(string $table, string $indexName): void
    {
        if (!$this->indexExists($table, $indexName)) return;

        Schema::table($table, function (Blueprint $t) use ($indexName) {
            $t->dropIndex($indexName);
        });
    }

    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'sc_delivered_to_analyst_at')) {
                $table->timestampTz('sc_delivered_to_analyst_at')->nullable();
            }
            if (!Schema::hasColumn('samples', 'analyst_received_at')) {
                $table->timestampTz('analyst_received_at')->nullable();
            }
        });

        // Helpful indexes (queue/timeline queries)
        $this->addIndexIfMissing(
            'samples',
            'sc_delivered_to_analyst_at',
            'samples_sc_delivered_to_analyst_at_idx'
        );
        $this->addIndexIfMissing(
            'samples',
            'analyst_received_at',
            'samples_analyst_received_at_idx'
        );
    }

    public function down(): void
    {
        $this->dropIndexIfExists('samples', 'samples_sc_delivered_to_analyst_at_idx');
        $this->dropIndexIfExists('samples', 'samples_analyst_received_at_idx');

        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasColumn('samples', 'analyst_received_at')) {
                $table->dropColumn('analyst_received_at');
            }
            if (Schema::hasColumn('samples', 'sc_delivered_to_analyst_at')) {
                $table->dropColumn('sc_delivered_to_analyst_at');
            }
        });
    }
};