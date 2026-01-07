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
        Schema::create('report_signoffs', function (Blueprint $table) {
            // PK
            $table->bigIncrements('sign_id');

            // Link to report and signer
            $table->unsignedBigInteger('report_id');
            $table->unsignedBigInteger('signed_by');

            // Role and timestamp
            $table->string('role', 8);
            $table->timestampTz('signed_at');

            // System timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Constraints
            $table->unique(['report_id', 'role'], 'uq_signoff_report_role');
            $table->index('signed_by', 'idx_signoff_signer');

            // FK
            $table->foreign('report_id', 'fk_signoff_report')
                ->references('report_id')->on('reports')
                ->cascadeOnDelete()
                ->cascadeOnUpdate();

            $table->foreign('signed_by', 'fk_signoff_staffs_signer')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // CHECK Constraint for allowed roles
        DB::statement(
            "ALTER TABLE report_signoffs
            ADD CONSTRAINT chk_signoff_role
            CHECK (role IN ('OM', 'LH'))"
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE report_signoffs DROP CONSTRAINT IF EXISTS chk_signoff_role;");

        Schema::table('report_signoffs', function (Blueprint $table) {
            // FIX: di up() namanya fk_signoff_report (singular)
            $table->dropForeign('fk_signoff_report');
            $table->dropForeign('fk_signoff_staffs_signer');

            $table->dropUnique('uq_signoff_report_role');
            $table->dropIndex('idx_signoff_signer');
        });

        Schema::dropIfExists('report_signoffs');
    }
};
