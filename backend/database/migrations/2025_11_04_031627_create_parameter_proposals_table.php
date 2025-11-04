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
        Schema::create('parameter_proposals', function (Blueprint $table) {
            // PK
            $table->bigIncrements('proposal_id');

            // Main Columns
            $table->string('name', 150);
            $table->string('principle');
            $table->string('validation_data');
            $table->string('status', 150)->default('pending');

            // FK to staffs.staff_id
            $table->unsignedBigInteger('proposed_by');

            // Review & Linkage Fields
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->unsignedBigInteger('linked_parameter_id')->nullable();

            // System Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('proposed_by', 'idx_prop_proposer');
            $table->index('reviewed_by', 'idx_prop_reviewer');
            $table->index('linked_parameter_id', 'idx_prop_parameter');

            // FK Constraints
            // proposer
            $table->foreign('proposed_by', 'fk_prop_staffs_proposer')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            // reviewer
            $table->foreign('reviewed_by', 'fk_prop_staffs_reviewer')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            // linked parameter
            $table->foreign('linked_parameter_id', 'fk_prop_parameters')
                ->references('parameter_id')->on('parameters')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // CHECK Constraint
        DB::statement("
            ALTER TABLE parameter_proposals
            ADD CONSTRAINT chk_prop_status
            CHECK (status IN ('pending', 'approved', 'rejected'))
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // DROP CHECK Constraint
        DB::statement(
            "ALTER TABLE parameter_proposals
            DROP CONSTRAINT IF EXISTS chk_prop_status
        "
        );

        Schema::table('parameter_proposals', function (Blueprint $table) {
            // Drop Foreign Key Constraints
            $table->dropForeign('fk_prop_staffs_proposer');
            $table->dropForeign('fk_prop_staffs_reviewer');
            $table->dropForeign('fk_prop_parameters');

            // Drop Indexes
            $table->dropIndex('idx_prop_proposer');
            $table->dropIndex('idx_prop_reviewer');
            $table->dropIndex('idx_prop_parameter');
        });

        Schema::dropIfExists('parameter_proposals');
    }
};
