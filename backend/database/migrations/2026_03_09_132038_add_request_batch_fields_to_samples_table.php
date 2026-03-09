<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('samples')) {
            return;
        }

        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'request_batch_id')) {
                $table->uuid('request_batch_id')->nullable()->after('client_id');
            }

            if (!Schema::hasColumn('samples', 'request_batch_total')) {
                $table->unsignedInteger('request_batch_total')->default(1)->after('request_batch_id');
            }

            if (!Schema::hasColumn('samples', 'request_batch_item_no')) {
                $table->unsignedInteger('request_batch_item_no')->default(1)->after('request_batch_total');
            }

            if (!Schema::hasColumn('samples', 'is_batch_primary')) {
                $table->boolean('is_batch_primary')->default(false)->after('request_batch_item_no');
            }

            if (!Schema::hasColumn('samples', 'batch_excluded_at')) {
                $table->timestamp('batch_excluded_at')->nullable()->after('is_batch_primary');
            }

            if (!Schema::hasColumn('samples', 'batch_exclusion_reason')) {
                $table->string('batch_exclusion_reason', 100)->nullable()->after('batch_excluded_at');
            }

            $table->index(['request_batch_id'], 'samples_request_batch_id_idx');
            $table->index(['client_id', 'request_batch_id'], 'samples_client_batch_idx');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('samples')) {
            return;
        }

        Schema::table('samples', function (Blueprint $table) {
            foreach (
                [
                    'samples_request_batch_id_idx',
                    'samples_client_batch_idx',
                ] as $index
            ) {
                try {
                    $table->dropIndex($index);
                } catch (\Throwable) {
                }
            }

            foreach (
                [
                    'batch_exclusion_reason',
                    'batch_excluded_at',
                    'is_batch_primary',
                    'request_batch_item_no',
                    'request_batch_total',
                    'request_batch_id',
                ] as $column
            ) {
                if (Schema::hasColumn('samples', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
