<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sample_tests', function (Blueprint $table) {
            $table->unsignedBigInteger('batch_id')->nullable()->after('sample_id');
            $table->index('batch_id', 'idx_sampletests_batch');
        });

        // Backfill ringan (SQL langsung, tidak looping PHP)
        DB::statement("UPDATE sample_tests SET batch_id = sample_id WHERE batch_id IS NULL;");

        // Enforce NOT NULL (Postgres aman; untuk driver lain tetap aman)
        Schema::table('sample_tests', function (Blueprint $table) {
            $table->unsignedBigInteger('batch_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('sample_tests', function (Blueprint $table) {
            $table->dropIndex('idx_sampletests_batch');
            $table->dropColumn('batch_id');
        });
    }
};
