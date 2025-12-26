<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'request_id')) {
                $table->unsignedBigInteger('request_id')->nullable();
                $table->index('request_id', 'idx_samples_request_id');
            }
        });

        Schema::table('samples', function (Blueprint $table) {
            // FK dibuat terpisah biar kolom pasti sudah ada
            if (Schema::hasColumn('samples', 'request_id')) {
                $table->foreign('request_id', 'fk_samples_sample_requests')
                    ->references('request_id')->on('sample_requests')
                    ->cascadeOnUpdate()
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            // drop FK dulu
            if (Schema::hasColumn('samples', 'request_id')) {
                $table->dropForeign('fk_samples_sample_requests');
                $table->dropIndex('idx_samples_request_id');
                $table->dropColumn('request_id');
            }
        });
    }
};
