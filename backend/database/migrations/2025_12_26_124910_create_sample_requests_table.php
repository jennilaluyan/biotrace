<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sample_requests', function (Blueprint $table) {
            $table->bigIncrements('request_id');

            // owner (portal client)
            $table->unsignedBigInteger('client_id');

            // metadata request
            $table->string('intended_sample_type', 120)->nullable();   // opsional: jenis sampel (swab, darah, dll)
            $table->string('examination_purpose', 200)->nullable();    // opsional: tujuan pemeriksaan
            $table->string('contact_history', 60)->nullable();         // opsional: isi nanti (tanpa CHECK dulu biar gak asumsi)
            $table->string('priority', 30)->nullable();                // opsional: normal/urgent, dll
            $table->text('additional_notes')->nullable();

            // workflow
            $table->string('request_status', 40)->default('submitted');

            // traceability handover / intake
            $table->unsignedBigInteger('handed_over_by')->nullable();  // staff_id (Admin)
            $table->timestampTz('handed_over_at')->nullable();

            $table->unsignedBigInteger('intake_checked_by')->nullable(); // staff_id (Sample Collector)
            $table->timestampTz('intake_checked_at')->nullable();

            $table->string('intake_result', 10)->nullable();           // pass/fail
            $table->text('intake_notes')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // indexes
            $table->index('client_id', 'idx_sample_requests_client');
            $table->index('request_status', 'idx_sample_requests_status');

            // FK
            $table->foreign('client_id', 'fk_sample_requests_clients')
                ->references('client_id')->on('clients')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('handed_over_by', 'fk_sample_requests_handed_over_by_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            $table->foreign('intake_checked_by', 'fk_sample_requests_intake_checked_by_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // CHECK request_status (sesuai Step 1)
        DB::statement("
            ALTER TABLE sample_requests
            ADD CONSTRAINT chk_sample_requests_status
            CHECK (request_status IN (
                'submitted',
                'reviewed',
                'approved',
                'rejected',
                'cancelled',
                'handed_over_to_collector',
                'intake_passed',
                'intake_failed',
                'converted_to_sample'
            ));
        ");

        // CHECK intake_result (optional tapi aman)
        DB::statement("
            ALTER TABLE sample_requests
            ADD CONSTRAINT chk_sample_requests_intake_result
            CHECK (intake_result IS NULL OR intake_result IN ('pass','fail'));
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE sample_requests DROP CONSTRAINT IF EXISTS chk_sample_requests_status;');
        DB::statement('ALTER TABLE sample_requests DROP CONSTRAINT IF EXISTS chk_sample_requests_intake_result;');

        Schema::table('sample_requests', function (Blueprint $table) {
            $table->dropForeign('fk_sample_requests_clients');
            $table->dropForeign('fk_sample_requests_handed_over_by_staffs');
            $table->dropForeign('fk_sample_requests_intake_checked_by_staffs');

            $table->dropIndex('idx_sample_requests_client');
            $table->dropIndex('idx_sample_requests_status');
        });

        Schema::dropIfExists('sample_requests');
    }
};
