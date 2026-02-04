<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quality_covers', function (Blueprint $table) {
            $table->bigIncrements('quality_cover_id');

            // per-sample (NOT per LOO)
            $table->unsignedBigInteger('sample_id')->index();

            // snapshot/assist fields (optional but useful)
            $table->string('workflow_group', 50)->nullable()->index();

            // Parameter display on form is "a thing"; sample can have multiple requestedParameters,
            // so we store a snapshot label for what analyst selected/used.
            $table->unsignedBigInteger('parameter_id')->nullable()->index();
            $table->string('parameter_label', 255)->nullable();

            // Auto-filled (today)
            $table->date('date_of_analysis')->index();

            // Manual field
            $table->text('method_of_analysis')->nullable();

            // Auto: checked by (Analyst)
            $table->unsignedBigInteger('checked_by_staff_id')->index();

            // Group-aware QC payload (PCR/WGS/others)
            $table->json('qc_payload')->nullable();

            // Draft/Submit flow (Step 11)
            $table->string('status', 30)->default('draft')->index(); // draft | submitted | ...
            $table->dateTime('submitted_at')->nullable();

            // Future-proof for Step 12 (OM verify + LH validate) - nullable so harmless now
            $table->unsignedBigInteger('verified_by_staff_id')->nullable()->index();
            $table->dateTime('verified_at')->nullable();

            $table->unsignedBigInteger('validated_by_staff_id')->nullable()->index();
            $table->dateTime('validated_at')->nullable();

            $table->text('reject_reason')->nullable();
            $table->unsignedBigInteger('rejected_by_staff_id')->nullable()->index();
            $table->dateTime('rejected_at')->nullable();

            // standard
            $table->timestamps();

            // FK
            $table->foreign('sample_id')
                ->references('sample_id')->on('samples')
                ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quality_covers');
    }
};
