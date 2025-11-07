<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('parameters', function (Blueprint $table) {
            $table->bigIncrements('parameter_id');

            $table->string('code', 40)->unique();   // ex: RT-PCR-SARS2
            $table->string('name', 150);            // ex: RT-PCR SARS-CoV-2
            $table->string('unit', 40);             // ex: Ct, copies/mL, etc.
            $table->string('method_ref', 120);      // ex: WHO, CDC, dll.

            // Staf pembuat (traceability)
            $table->unsignedBigInteger('created_by');
            $table->index('created_by', 'idx_parameters_creator');

            // Status & tag
            $table->string('status', 8);            // Active / Inactive
            $table->string('tag', 10);              // Routine / Research

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->foreign('created_by', 'fk_parameters_creator')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        DB::statement("
            ALTER TABLE parameters
            ADD CONSTRAINT chk_parameters_status
            CHECK (status IN ('Active','Inactive'));
        ");

        DB::statement("
            ALTER TABLE parameters
            ADD CONSTRAINT chk_parameters_tag
            CHECK (tag IN ('Routine','Research'));
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE parameters DROP CONSTRAINT IF EXISTS chk_parameters_status;');
        DB::statement('ALTER TABLE parameters DROP CONSTRAINT IF EXISTS chk_parameters_tag;');

        Schema::table('parameters', function (Blueprint $table) {
            $table->dropForeign('fk_parameters_creator');
            $table->dropIndex('idx_parameters_creator');
            $table->dropColumn('created_by');
        });

        Schema::dropIfExists('parameters');
    }
};
