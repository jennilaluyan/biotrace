<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipment_bookings', function (Blueprint $table) {
            $table->bigIncrements('booking_id');

            // FK: equipment_catalog (Step 5.1)
            $table->unsignedBigInteger('equipment_id');
            $table->foreign('equipment_id')
                ->references('equipment_id')
                ->on('equipment_catalog')
                ->restrictOnDelete();

            // Context anchor: tie to LOO for now (reagent_requests comes in To-Do 6)
            // letters_of_order biasanya pakai PK lo_id di project kamu
            $table->unsignedBigInteger('lo_id')->nullable();
            $table->foreign('lo_id')
                ->references('lo_id')
                ->on('letters_of_order')
                ->nullOnDelete();

            // Who booked it (staff actor)
            $table->unsignedBigInteger('booked_by_staff_id');
            $table->foreign('booked_by_staff_id')
                ->references('staff_id')
                ->on('staffs')
                ->restrictOnDelete();

            // Planned vs actual times
            $table->timestampTz('planned_start_at');
            $table->timestampTz('planned_end_at');

            $table->timestampTz('actual_start_at')->nullable();
            $table->timestampTz('actual_end_at')->nullable();

            // Status lifecycle
            // planned -> in_use -> completed
            // cancelled if aborted
            $table->string('status', 20)->default('planned')->index();

            // Optional metadata
            $table->text('note')->nullable();

            $table->timestamps();

            // Useful indexes for queries (availability & per-LOO view)
            $table->index(['equipment_id', 'planned_start_at']);
            $table->index(['equipment_id', 'planned_end_at']);
            $table->index(['lo_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_bookings');
    }
};
