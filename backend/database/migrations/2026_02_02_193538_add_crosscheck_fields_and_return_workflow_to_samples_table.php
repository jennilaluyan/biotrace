<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            // Crosscheck fields
            if (!Schema::hasColumn('samples', 'crosscheck_status')) {
                $table->string('crosscheck_status', 20)->default('pending')->index();
            }

            if (!Schema::hasColumn('samples', 'physical_label_code')) {
                $table->string('physical_label_code')->nullable();
            }

            if (!Schema::hasColumn('samples', 'crosschecked_at')) {
                $table->timestamp('crosschecked_at')->nullable()->index();
            }

            if (!Schema::hasColumn('samples', 'crosschecked_by_staff_id')) {
                $table->unsignedBigInteger('crosschecked_by_staff_id')->nullable()->index();
            }

            if (!Schema::hasColumn('samples', 'crosscheck_note')) {
                $table->text('crosscheck_note')->nullable();
            }

            // Return-to-SC physical workflow (only relevant when crosscheck failed)
            if (!Schema::hasColumn('samples', 'analyst_returned_to_sc_at')) {
                $table->timestamp('analyst_returned_to_sc_at')->nullable()->index();
            }

            if (!Schema::hasColumn('samples', 'sc_received_from_analyst_at')) {
                $table->timestamp('sc_received_from_analyst_at')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            // drop indexes safely (Laravel auto names can vary; simplest: drop columns only)
            if (Schema::hasColumn('samples', 'sc_received_from_analyst_at')) {
                $table->dropColumn('sc_received_from_analyst_at');
            }
            if (Schema::hasColumn('samples', 'analyst_returned_to_sc_at')) {
                $table->dropColumn('analyst_returned_to_sc_at');
            }

            if (Schema::hasColumn('samples', 'crosscheck_note')) {
                $table->dropColumn('crosscheck_note');
            }
            if (Schema::hasColumn('samples', 'crosschecked_by_staff_id')) {
                $table->dropColumn('crosschecked_by_staff_id');
            }
            if (Schema::hasColumn('samples', 'crosschecked_at')) {
                $table->dropColumn('crosschecked_at');
            }
            if (Schema::hasColumn('samples', 'physical_label_code')) {
                $table->dropColumn('physical_label_code');
            }
            if (Schema::hasColumn('samples', 'crosscheck_status')) {
                $table->dropColumn('crosscheck_status');
            }
        });
    }
};