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

            // Workflow group key: ex: pcr_sarscov2, wgs_sarscov2, group_19_22, group_23_32
            $table->string('workflow_group', 50);

            // Display name (editable later)
            $table->string('name', 120);

            // Optional settings for future (WIP): WIP limits, UI prefs, etc
            $table->json('settings')->nullable();

            // Who created/edited (optional; keep nullable to allow seeding/system)
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
