<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('equipment_bookings', function (Blueprint $table) {
            if (!Schema::hasColumn('equipment_bookings', 'reagent_request_id')) {
                $table->unsignedBigInteger('reagent_request_id')->nullable()->after('lo_id');

                // FK -> reagent_requests
                // NOTE: pastikan PK reagent_requests kamu benar (lihat catatan di bawah).
                $table->foreign('reagent_request_id')
                    ->references('reagent_request_id')
                    ->on('reagent_requests')
                    ->nullOnDelete();

                $table->index(['reagent_request_id', 'planned_start_at']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('equipment_bookings', function (Blueprint $table) {
            if (Schema::hasColumn('equipment_bookings', 'reagent_request_id')) {
                $table->dropForeign(['reagent_request_id']);
                $table->dropIndex(['reagent_request_id', 'planned_start_at']);
                $table->dropColumn('reagent_request_id');
            }
        });
    }
};
