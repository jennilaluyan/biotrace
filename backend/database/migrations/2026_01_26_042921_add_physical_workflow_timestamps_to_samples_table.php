<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            // Helper closure: add column only if it doesn't exist
            $addIfMissing = function (string $name, callable $columnDef) use ($table) {
                if (!Schema::hasColumn('samples', $name)) {
                    $columnDef($table);
                }
            };

            /**
             * Physical workflow timestamps
             * (Admin & Sample Collector handoffs)
             *
             * NOTE:
             * - Use nullable timestamps to avoid breaking existing rows.
             * - Guarded with hasColumn to prevent duplicate-column failures.
             */

            // Admin: mark received from client (time)
            $addIfMissing('admin_received_from_client_at', function (Blueprint $t) {
                $t->timestamp('admin_received_from_client_at')->nullable();
            });

            // Admin: mark brought to collector (time)
            $addIfMissing('admin_handed_to_collector_at', function (Blueprint $t) {
                $t->timestamp('admin_handed_to_collector_at')->nullable();
            });

            // Collector: mark received (time)  <-- this is the one that duplicated in your error
            $addIfMissing('collector_received_at', function (Blueprint $t) {
                $t->timestamp('collector_received_at')->nullable();
            });

            // Collector: mark finished inspection (time)
            $addIfMissing('collector_completed_at', function (Blueprint $t) {
                $t->timestamp('collector_completed_at')->nullable();
            });

            // Collector: mark returned to admin (time)
            $addIfMissing('collector_returned_to_admin_at', function (Blueprint $t) {
                $t->timestamp('collector_returned_to_admin_at')->nullable();
            });

            // Admin: mark received from collector (time)
            $addIfMissing('admin_received_from_collector_at', function (Blueprint $t) {
                $t->timestamp('admin_received_from_collector_at')->nullable();
            });

            // Admin: record client pickup time
            $addIfMissing('client_picked_up_at', function (Blueprint $t) {
                $t->timestamp('client_picked_up_at')->nullable();
            });
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            // Helper closure: drop column only if it exists
            $dropIfExists = function (string $name) use ($table) {
                if (Schema::hasColumn('samples', $name)) {
                    $table->dropColumn($name);
                }
            };

            $dropIfExists('client_picked_up_at');
            $dropIfExists('admin_received_from_collector_at');
            $dropIfExists('collector_returned_to_admin_at');
            $dropIfExists('collector_completed_at');
            $dropIfExists('collector_received_at');
            $dropIfExists('admin_handed_to_collector_at');
            $dropIfExists('admin_received_from_client_at');
        });
    }
};
