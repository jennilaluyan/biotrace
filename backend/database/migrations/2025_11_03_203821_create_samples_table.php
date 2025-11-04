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
        Schema::create('samples', function (Blueprint $table) {
            // PK
            $table->bigIncrements('sample_id');

            // FK to clients.client_id
            $table->unsignedBigInteger('client_id');

            // Main columns
            $table->timestampTz('received_at');
            $table->string('sample_type', 80);
            $table->smallInteger('priority')->default(0);
            $table->string('current_status', 18);

            // Staffs traceability
            $table->unsignedBigInteger('created_by');

            // Indexes for Quick Access
            $table->index('client_id', 'idx_samples_client');
            $table->index('created_by', 'idx_samples_creator');

            // FK Constraints
            $table->foreign('client_id', 'fk_samples_client')
                ->references('client_id')->on('clients')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('created_by', 'fk_samples_staffs_creator')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // CHECK CONSTRAINT for current_status according to lab workflow
        DB::statement("ALTER TABLE samples ADD CONSTRAINT chk_samples_status CHECK (current_status IN ('received','in_progress', 'testing_completed', 'verified', 'validated', 'reported'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // DROP CHECK CONSTRAINT
        DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_status");

        // DROP TABLE
        Schema::table('samples', function (Blueprint $table) {
            $table->dropForeign('fk_samples_client');
            $table->dropForeign('fk_samples_staffs_creator');
            $table->dropIndex('idx_samples_client');
            $table->dropIndex('idx_samples_creator');
        });

        Schema::dropIfExists('samples');
    }
};
