<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('letters_of_order', function (Blueprint $table) {
            // PK
            $table->bigIncrements('lo_id');

            // 1:1 to samples
            $table->unsignedBigInteger('sample_id');

            // Letter identity
            $table->string('number', 60)->unique();
            $table->timestampTz('generated_at');
            $table->text('file_url');

            // System timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Index
            $table->unique('sample_id', 'uq_lo_sample');

            // FK rules
            $table->foreign('sample_id', 'fk_lo_samples')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('letters_of_order', function (Blueprint $table) {
            $table->dropForeign('fk_lo_samples');
            $table->dropUnique('uq_lo_sample');
        });

        Schema::dropIfExists('letters_of_order');
    }
};
