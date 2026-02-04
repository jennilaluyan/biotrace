<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('testing_columns', function (Blueprint $table) {
            $table->bigIncrements('column_id');

            $table->unsignedBigInteger('board_id');
            $table->string('name', 120);

            $table->integer('position')->default(0);
            $table->boolean('is_terminal')->default(false);

            $table->unsignedBigInteger('created_by_staff_id')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->index(['board_id', 'position'], 'idx_testing_columns_board_position');
            $table->unique(['board_id', 'position'], 'uq_testing_columns_board_position');

            $table->foreign('board_id', 'fk_testing_columns_board')
                ->references('board_id')->on('testing_boards')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('created_by_staff_id', 'fk_testing_columns_created_by_staff')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('testing_columns');
    }
};
