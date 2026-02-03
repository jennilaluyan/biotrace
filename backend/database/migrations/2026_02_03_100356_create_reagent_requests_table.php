<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reagent_requests', function (Blueprint $table) {
            $table->bigIncrements('reagent_request_id');

            // 1 request per LOO per cycle
            $table->unsignedBigInteger('lo_id');
            $table->unsignedInteger('cycle_no')->default(1);

            // Link to previous request when revised after rejection
            $table->unsignedBigInteger('previous_request_id')->nullable();

            // draft | submitted | approved | rejected
            $table->string('status', 24)->default('draft');

            // Actors & timestamps
            $table->unsignedBigInteger('created_by_staff_id')->nullable();

            $table->timestamp('submitted_at')->nullable();
            $table->unsignedBigInteger('submitted_by_staff_id')->nullable();

            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('approved_by_staff_id')->nullable();

            $table->timestamp('rejected_at')->nullable();
            $table->unsignedBigInteger('rejected_by_staff_id')->nullable();
            $table->text('reject_note')->nullable();

            // Used later in 6.3 (lock snapshot)
            $table->timestamp('locked_at')->nullable();

            $table->timestamps();

            // Indexes
            $table->unique(['lo_id', 'cycle_no'], 'uniq_reagent_request_lo_cycle');
            $table->index(['lo_id', 'status'], 'idx_reagent_request_lo_status');

            // FKs
            $table->foreign('lo_id')
                ->references('lo_id')
                ->on('letters_of_order')
                ->cascadeOnDelete();

            // staff_id lives in staffs table
            $table->foreign('created_by_staff_id')
                ->references('staff_id')
                ->on('staffs')
                ->nullOnDelete();

            $table->foreign('submitted_by_staff_id')
                ->references('staff_id')
                ->on('staffs')
                ->nullOnDelete();

            $table->foreign('approved_by_staff_id')
                ->references('staff_id')
                ->on('staffs')
                ->nullOnDelete();

            $table->foreign('rejected_by_staff_id')
                ->references('staff_id')
                ->on('staffs')
                ->nullOnDelete();

            // self reference
            $table->foreign('previous_request_id')
                ->references('reagent_request_id')
                ->on('reagent_requests')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reagent_requests');
    }
};
