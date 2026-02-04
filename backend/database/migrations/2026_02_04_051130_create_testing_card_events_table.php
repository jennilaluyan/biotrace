<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('testing_card_events', function (Blueprint $table) {
            $table->bigIncrements('event_id');

            $table->unsignedBigInteger('board_id');
            $table->unsignedBigInteger('sample_id');

            $table->unsignedBigInteger('from_column_id')->nullable();
            $table->unsignedBigInteger('to_column_id');

            $table->unsignedBigInteger('moved_by_staff_id');

            $table->timestampTz('moved_at')->useCurrent();

            $table->text('note')->nullable();
            $table->json('meta')->nullable();

            $table->index(['board_id', 'moved_at'], 'idx_testing_card_events_board_time');
            $table->index(['sample_id', 'moved_at'], 'idx_testing_card_events_sample_time');

            $table->foreign('board_id', 'fk_testing_card_events_board')
                ->references('board_id')->on('testing_boards')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('sample_id', 'fk_testing_card_events_sample')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('from_column_id', 'fk_testing_card_events_from_column')
                ->references('column_id')->on('testing_columns')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            $table->foreign('to_column_id', 'fk_testing_card_events_to_column')
                ->references('column_id')->on('testing_columns')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('moved_by_staff_id', 'fk_testing_card_events_moved_by_staff')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('testing_card_events');
    }
};
