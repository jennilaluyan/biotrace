<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reagent_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('reagent_requests', 'file_url')) {
                $table->string('file_url', 1024)->nullable()->after('locked_at');
                $table->index('file_url', 'idx_reagent_requests_file_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reagent_requests', function (Blueprint $table) {
            if (Schema::hasColumn('reagent_requests', 'file_url')) {
                $table->dropIndex('idx_reagent_requests_file_url');
                $table->dropColumn('file_url');
            }
        });
    }
};
