<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('testing_card_events', function (Blueprint $table) {
            if (!Schema::hasColumn('testing_card_events', 'entered_at')) {
                $table->timestampTz('entered_at')->nullable()->after('moved_at');
            }
            if (!Schema::hasColumn('testing_card_events', 'exited_at')) {
                $table->timestampTz('exited_at')->nullable()->after('entered_at');
            }

            // Optional helpful index (safe)
            if (!Schema::hasIndex('testing_card_events', 'idx_testing_card_events_sample_exited')) {
                $table->index(['sample_id', 'exited_at'], 'idx_testing_card_events_sample_exited');
            }
        });
    }

    public function down(): void
    {
        Schema::table('testing_card_events', function (Blueprint $table) {
            if (Schema::hasColumn('testing_card_events', 'entered_at')) {
                $table->dropColumn('entered_at');
            }
            if (Schema::hasColumn('testing_card_events', 'exited_at')) {
                $table->dropColumn('exited_at');
            }

            if (Schema::hasIndex('testing_card_events', 'idx_testing_card_events_sample_exited')) {
                $table->dropIndex('idx_testing_card_events_sample_exited');
            }
        });
    }
};
