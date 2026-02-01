<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loo_sample_approvals', function (Blueprint $table) {
            $table->bigIncrements('approval_id');

            $table->unsignedBigInteger('sample_id');
            $table->string('role_code', 8); // "OM" | "LH"

            $table->unsignedBigInteger('approved_by_staff_id')->nullable();
            $table->timestampTz('approved_at')->nullable();

            $table->timestampTz('created_at')->nullable();
            $table->timestampTz('updated_at')->nullable();

            $table->unique(['sample_id', 'role_code'], 'uq_loo_sample_role');
            $table->index(['sample_id']);
            $table->index(['role_code']);
            $table->index(['approved_at']);

            // FK sample
            $table->foreign('sample_id')
                ->references('sample_id')
                ->on('samples')
                ->onDelete('cascade');

            // FK staff (optional — only add if table exists)
            // NOTE: in your project staff table is "staffs"
            if (Schema::hasTable('staffs')) {
                $table->foreign('approved_by_staff_id')
                    ->references('staff_id')
                    ->on('staffs')
                    ->onDelete('restrict');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loo_sample_approvals');
    }
};
