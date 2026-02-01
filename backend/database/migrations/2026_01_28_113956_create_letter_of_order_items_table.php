<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('letter_of_order_items', function (Blueprint $table) {
            $table->bigIncrements('item_id');

            $table->unsignedBigInteger('lo_id');
            $table->unsignedBigInteger('sample_id');

            $table->string('lab_sample_code', 64);
            $table->jsonb('parameters')->nullable(); // [{parameter_id,code,name}, ...]

            $table->timestampTz('created_at')->nullable();
            $table->timestampTz('updated_at')->nullable();

            $table->index(['lo_id']);
            $table->index(['sample_id']);
            $table->index(['lab_sample_code']);

            // FK
            $table->foreign('lo_id')->references('lo_id')->on('letters_of_order')->onDelete('cascade');
            $table->foreign('sample_id')->references('sample_id')->on('samples')->onDelete('restrict');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('letter_of_order_items');
    }
};
