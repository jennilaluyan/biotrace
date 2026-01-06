<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            // aman kalau belum ada
            if (!Schema::hasColumn('audit_logs', 'action')) return;

            $table->index('action');
            $table->index('staff_id');
            $table->index(['entity_name', 'entity_id']);
            // kalau ada timestamp column, index itu. kalau nggak, index created_at.
            if (Schema::hasColumn('audit_logs', 'timestamp')) {
                $table->index('timestamp');
            } else {
                $table->index('created_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(['action']);
            $table->dropIndex(['staff_id']);
            $table->dropIndex(['entity_name', 'entity_id']);
            if (Schema::hasColumn('audit_logs', 'timestamp')) {
                $table->dropIndex(['timestamp']);
            } else {
                $table->dropIndex(['created_at']);
            }
        });
    }
};
