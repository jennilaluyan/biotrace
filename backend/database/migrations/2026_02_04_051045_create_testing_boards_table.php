<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('testing_boards', function (Blueprint $table) {
            $table->bigIncrements('board_id');

            $table->string('workflow_group', 50);
            $table->string('name', 120);

            $table->json('settings')->nullable();
            $table->unsignedBigInteger('created_by_staff_id')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->unique('workflow_group', 'uq_testing_boards_workflow_group');

            $table->foreign('created_by_staff_id', 'fk_testing_boards_created_by_staff')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('testing_boards');
    }
};
