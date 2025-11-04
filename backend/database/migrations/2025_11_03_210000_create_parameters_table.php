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
        Schema::create('parameters', function (Blueprint $table) {
            // PK
            $table->bigIncrements('parameter_id');

            // Main Columns
            $table->string('code', 40)->unique();
            $table->string('name', 150);
            $table->string('unit', 40);
            $table->string('method_ref', 120);

            // FK and index to staffs.staff_id
            $table->unsignedBigInteger('created_by');
            $table->index('created_by', 'idx_parameters_creator');

            // Status and Categorization
            $table->string('status', 8);
            $table->string('tag', 10);

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // FK Constraints to staffs.staff_id
            $table->foreign('created_by', 'fk_parameters_creator')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // CHECK Constraints
        DB::statement(
            "ALTER TABLE parameters
             ADD CONSTRAINT chk_parameters_status
             CHECK (status IN ('Active','Inactive'))"
        );

        DB::statement(
            "ALTER TABLE parameters
             ADD CONSTRAINT chk_parameters_tag
             CHECK (tag IN ('Routine', 'Research'))"
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // DROP CHECK Constraints
        DB::statement("ALTER TABLE
        parameters DROP CONSTRAINT IF EXISTS chk_parameters_status;
        ");
        DB::statement("ALTER TABLE
        parameters DROP CONSTRAINT IF EXISTS chk_parameters_tag;
        ");

        // DROP FK constraints
        Schema::table('parameters', function (Blueprint $table) {
            $table->dropForeign('fk_parameters_staffs_creator');
            $table->dropIndex('idx_parameters_creator');
            $table->dropColumn('created_by');
        });

        Schema::dropIfExists('parameters');
    }
};
