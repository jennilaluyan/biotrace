<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('quality_covers')) return;

        Schema::table('quality_covers', function (Blueprint $table) {
            if (!Schema::hasColumn('quality_covers', 'supporting_drive_url')) {
                $table->string('supporting_drive_url', 500)->nullable()->after('method_of_analysis');
                $table->index('supporting_drive_url', 'idx_qc_supporting_drive_url');
            }

            if (!Schema::hasColumn('quality_covers', 'supporting_notes')) {
                $table->text('supporting_notes')->nullable()->after('supporting_drive_url');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('quality_covers')) return;

        Schema::table('quality_covers', function (Blueprint $table) {
            if (Schema::hasColumn('quality_covers', 'supporting_drive_url')) {
                try {
                    $table->dropIndex('idx_qc_supporting_drive_url');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('supporting_drive_url');
            }

            if (Schema::hasColumn('quality_covers', 'supporting_notes')) {
                $table->dropColumn('supporting_notes');
            }
        });
    }
};
