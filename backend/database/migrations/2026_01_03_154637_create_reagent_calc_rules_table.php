<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reagent_calc_rules', function (Blueprint $table) {
            $table->bigIncrements('rule_id');

            $table->string('name')->nullable();

            // Scoped matching (nullable to allow method-only OR parameter-only rules)
            $table->unsignedBigInteger('method_id')->nullable();
            $table->unsignedBigInteger('parameter_id')->nullable();

            // JSON rules (data-driven contract)
            $table->json('rule_json');

            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->boolean('is_active')->default(true);

            // Optional provenance (no FK to avoid schema mismatch assumptions)
            $table->unsignedBigInteger('created_by')->nullable();

            $table->timestamps();

            // Indexes for fast resolver lookups (most important)
            $table->index(['method_id', 'parameter_id', 'is_active'], 'idx_rule_scope_active');
            $table->index(['method_id', 'is_active'], 'idx_rule_method_active');
            $table->index(['parameter_id', 'is_active'], 'idx_rule_param_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reagent_calc_rules');
    }
};