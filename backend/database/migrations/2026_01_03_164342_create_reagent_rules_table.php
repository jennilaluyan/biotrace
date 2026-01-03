<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reagent_rules', function (Blueprint $table) {
            $table->bigIncrements('rule_id');

            $table->unsignedBigInteger('parameter_id');
            $table->unsignedBigInteger('method_id')->nullable(); // null = default rule for parameter

            $table->string('rule_code')->nullable(); // optional human-readable
            $table->unsignedInteger('version_no')->default(1);
            $table->boolean('is_active')->default(true);

            /**
             * formula JSONB (Postgres):
             * {
             *   "type": "simple_v1",
             *   "aliquot_uL": 20,
             *   "dilution_factor": 1,
             *   "qc_runs": 0,
             *   "blank_runs": 0,
             *   "reagents": [
             *      {"reagent_id": 1, "uL_per_run": 10},
             *      {"reagent_id": 2, "uL_per_run": 5}
             *   ]
             * }
             */
            $table->jsonb('formula');

            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['parameter_id', 'method_id']);
            $table->index(['is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reagent_rules');
    }
};