<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            $table->unsignedBigInteger('assigned_to')->nullable()->after('created_by');
            $table->index('assigned_to', 'idx_samples_assignee');

            $table->foreign('assigned_to', 'fk_samples_staffs_assignee')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // backfill: sample lama -> assigned_to = created_by
        DB::statement("UPDATE samples SET assigned_to = created_by WHERE assigned_to IS NULL;");
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            $table->dropForeign('fk_samples_staffs_assignee');
            $table->dropIndex('idx_samples_assignee');
            $table->dropColumn('assigned_to');
        });
    }
};
