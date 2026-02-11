<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sample_id_change_requests', function (Blueprint $table) {
            $table->bigIncrements('change_request_id');

            $table->unsignedBigInteger('sample_id');
            $table->string('suggested_sample_id', 20);
            $table->string('proposed_sample_id', 20);

            $table->string('status', 10)->default('PENDING');

            $table->unsignedBigInteger('requested_by_staff_id');
            $table->unsignedBigInteger('reviewed_by_staff_id')->nullable();
            $table->text('review_note')->nullable();

            $table->index('sample_id', 'idx_sample_id_change_requests_sample');
            $table->index('status', 'idx_sample_id_change_requests_status');

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->foreign('sample_id', 'fk_sample_id_change_requests_sample')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('requested_by_staff_id', 'fk_sample_id_change_requests_requested_by')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('reviewed_by_staff_id', 'fk_sample_id_change_requests_reviewed_by')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE sample_id_change_requests
                ADD CONSTRAINT chk_sample_id_change_requests_status
                CHECK (status IN ('PENDING','APPROVED','REJECTED'))
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE sample_id_change_requests DROP CONSTRAINT IF EXISTS chk_sample_id_change_requests_status;');
        }

        Schema::table('sample_id_change_requests', function (Blueprint $table) {
            $table->dropForeign('fk_sample_id_change_requests_sample');
            $table->dropForeign('fk_sample_id_change_requests_requested_by');
            $table->dropForeign('fk_sample_id_change_requests_reviewed_by');
            $table->dropIndex('idx_sample_id_change_requests_sample');
            $table->dropIndex('idx_sample_id_change_requests_status');
        });

        Schema::dropIfExists('sample_id_change_requests');
    }
};