<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'workflow_group')) {
                // disimpan sebagai label ringkas: biomolekuler | mikrobiologi | mixed | unknown | dst
                $table->string('workflow_group', 40)->nullable()->after('request_status');
                $table->index('workflow_group', 'idx_samples_workflow_group');
            }
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasColumn('samples', 'workflow_group')) {
                // index drop dulu (pgsql-safe)
                try {
                    $table->dropIndex('idx_samples_workflow_group');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('workflow_group');
            }
        });
    }
};
