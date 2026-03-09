<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('report_samples', function (Blueprint $table) {
            $table->bigIncrements('report_sample_id');
            $table->unsignedBigInteger('report_id');
            $table->unsignedBigInteger('sample_id');
            $table->unsignedInteger('batch_item_no')->nullable();
            $table->timestamps();

            $table->unique(['report_id', 'sample_id'], 'uq_report_samples_report_sample');
            $table->index('sample_id', 'idx_report_samples_sample');
            $table->index('report_id', 'idx_report_samples_report');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_samples');
    }
};
