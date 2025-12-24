<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
{
    Schema::table('audit_logs', function (Blueprint $table) {
        $table->index(['entity_name', 'entity_id', 'timestamp'], 'idx_audit_entity_time');
    });
}

public function down(): void
{
    Schema::table('audit_logs', function (Blueprint $table) {
        $table->dropIndex('idx_audit_entity_time');
    });
}

};