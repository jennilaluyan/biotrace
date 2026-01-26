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
            // fail-open (let schema builder attempt)
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
        /**
         * Step 3 — DB Migration untuk timestamps/event (F2)
         * Final column names MUST match Step 2 UI/API.
         *
         * Final:
         * - admin_received_from_client_at
         * - admin_brought_to_collector_at   (NOT admin_handed_to_collector_at)
         * - collector_received_at
         * - collector_intake_completed_at  (NOT collector_completed_at)
         * - collector_returned_to_admin_at
         * - admin_received_from_collector_at
         * - client_picked_up_at
         * - admin_note_to_client (text)
         */

        // 0) Rename legacy columns if they exist (safety)
        if (Schema::hasColumn('samples', 'admin_handed_to_collector_at') && !Schema::hasColumn('samples', 'admin_brought_to_collector_at')) {
            Schema::table('samples', function (Blueprint $t) {
                $t->renameColumn('admin_handed_to_collector_at', 'admin_brought_to_collector_at');
            });
        }

        if (Schema::hasColumn('samples', 'collector_completed_at') && !Schema::hasColumn('samples', 'collector_intake_completed_at')) {
            Schema::table('samples', function (Blueprint $t) {
                $t->renameColumn('collector_completed_at', 'collector_intake_completed_at');
            });
        }

        // 1) Add missing columns (guarded)
        Schema::table('samples', function (Blueprint $table) {
            $addIfMissing = function (string $name, callable $columnDef) use ($table) {
                if (!Schema::hasColumn('samples', $name)) {
                    $columnDef($table);
                }
            };

            // Admin: received from client
            $addIfMissing('admin_received_from_client_at', function (Blueprint $t) {
                $t->timestampTz('admin_received_from_client_at')->nullable();
            });

            // Admin: brought to collector (final name)
            $addIfMissing('admin_brought_to_collector_at', function (Blueprint $t) {
                $t->timestampTz('admin_brought_to_collector_at')->nullable();
            });

            // Collector: received
            $addIfMissing('collector_received_at', function (Blueprint $t) {
                $t->timestampTz('collector_received_at')->nullable();
            });

            // Collector: intake checklist completed (final name)
            $addIfMissing('collector_intake_completed_at', function (Blueprint $t) {
                $t->timestampTz('collector_intake_completed_at')->nullable();
            });

            // Collector: returned to admin
            $addIfMissing('collector_returned_to_admin_at', function (Blueprint $t) {
                $t->timestampTz('collector_returned_to_admin_at')->nullable();
            });

            // Admin: received from collector
            $addIfMissing('admin_received_from_collector_at', function (Blueprint $t) {
                $t->timestampTz('admin_received_from_collector_at')->nullable();
            });

            // Client: picked up
            $addIfMissing('client_picked_up_at', function (Blueprint $t) {
                $t->timestampTz('client_picked_up_at')->nullable();
            });

            // Admin: note to client
            $addIfMissing('admin_note_to_client', function (Blueprint $t) {
                $t->text('admin_note_to_client')->nullable();
            });
        });

        // 2) Minimal indexes for queue filtering (safe)
        $this->addIndexIfMissing('samples', 'admin_received_from_client_at', 'samples_admin_received_from_client_at_idx');
        $this->addIndexIfMissing('samples', 'collector_received_at', 'samples_collector_received_at_idx');
        $this->addIndexIfMissing('samples', 'admin_received_from_collector_at', 'samples_admin_received_from_collector_at_idx');
        $this->addIndexIfMissing('samples', 'client_picked_up_at', 'samples_client_picked_up_at_idx');
    }

    public function down(): void
    {
        // Drop indexes first (pgsql-safe)
        $this->dropIndexIfExists('samples', 'samples_admin_received_from_client_at_idx');
        $this->dropIndexIfExists('samples', 'samples_collector_received_at_idx');
        $this->dropIndexIfExists('samples', 'samples_admin_received_from_collector_at_idx');
        $this->dropIndexIfExists('samples', 'samples_client_picked_up_at_idx');

        // Rename back (only if needed)
        if (Schema::hasColumn('samples', 'admin_brought_to_collector_at') && !Schema::hasColumn('samples', 'admin_handed_to_collector_at')) {
            Schema::table('samples', function (Blueprint $t) {
                $t->renameColumn('admin_brought_to_collector_at', 'admin_handed_to_collector_at');
            });
        }

        if (Schema::hasColumn('samples', 'collector_intake_completed_at') && !Schema::hasColumn('samples', 'collector_completed_at')) {
            Schema::table('samples', function (Blueprint $t) {
                $t->renameColumn('collector_intake_completed_at', 'collector_completed_at');
            });
        }

        /**
         * IMPORTANT SAFETY:
         * collector_received_at kemungkinan sudah ada dari migration lain.
         * Jadi di rollback kita TIDAK drop collector_received_at supaya nggak ngerusak step sebelumnya.
         */
        Schema::table('samples', function (Blueprint $table) {
            $dropIfExists = function (string $name) use ($table) {
                if (Schema::hasColumn('samples', $name)) {
                    $table->dropColumn($name);
                }
            };

            $dropIfExists('admin_note_to_client');
            $dropIfExists('client_picked_up_at');
            $dropIfExists('admin_received_from_collector_at');
            $dropIfExists('collector_returned_to_admin_at');

            // Jangan drop collector_received_at (lihat catatan di atas)

            $dropIfExists('admin_received_from_client_at');
            // admin_brought_to_collector_at sudah di-rename balik kalau perlu
            // collector_intake_completed_at sudah di-rename balik kalau perlu
        });
    }
};
