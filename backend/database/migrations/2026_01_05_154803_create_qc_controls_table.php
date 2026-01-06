<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qc_controls', function (Blueprint $table) {
            $table->bigIncrements('qc_control_id');

            // scope QC: minimal per-parameter, optional per-method
            $table->unsignedBigInteger('parameter_id');
            $table->unsignedBigInteger('method_id')->nullable();

            // type: MVP pakai control_material; tapi siap untuk blank/spike/duplicate
            $table->string('control_type', 32); // control_material|blank|spike|duplicate

            // Untuk Westgard: target=mean, tolerance=SD (bukan %)
            $table->decimal('target', 18, 6)->nullable();
            $table->decimal('tolerance', 18, 6)->nullable();

            // ruleset fleksibel, default minimal: ["1-2s","1-3s","R-4s"]
            if (DB::getDriverName() === 'pgsql') {
                $table->jsonb('ruleset')->default(DB::raw("'[\"1-2s\",\"1-3s\",\"R-4s\"]'::jsonb"));
            } else {
                $table->json('ruleset');
            }

            $table->boolean('is_active')->default(true);
            $table->text('note')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // indexes
            $table->index('parameter_id', 'idx_qccontrols_param');
            $table->index('method_id', 'idx_qccontrols_method');
            $table->index('control_type', 'idx_qccontrols_type');
            $table->index(['parameter_id', 'method_id', 'control_type'], 'idx_qccontrols_scope');
        });

        // FK constraints
        Schema::table('qc_controls', function (Blueprint $table) {
            $table->foreign('parameter_id', 'fk_qccontrols_parameters')
                ->references('parameter_id')->on('parameters')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('method_id', 'fk_qccontrols_methods')
                ->references('method_id')->on('methods')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // Check constraint (Postgres only) supaya control_type valid
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE qc_controls
                ADD CONSTRAINT chk_qccontrols_type
                CHECK (control_type IN ('control_material','blank','spike','duplicate'));
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE qc_controls DROP CONSTRAINT IF EXISTS chk_qccontrols_type;');
        }

        Schema::table('qc_controls', function (Blueprint $table) {
            $table->dropForeign('fk_qccontrols_parameters');
            $table->dropForeign('fk_qccontrols_methods');
            $table->dropIndex('idx_qccontrols_param');
            $table->dropIndex('idx_qccontrols_method');
            $table->dropIndex('idx_qccontrols_type');
            $table->dropIndex('idx_qccontrols_scope');
        });

        Schema::dropIfExists('qc_controls');
    }
};
