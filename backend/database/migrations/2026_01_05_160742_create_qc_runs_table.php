<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qc_runs', function (Blueprint $table) {
            $table->bigIncrements('qc_run_id');

            // batch = sample_id (MVP). Nanti bisa dipakai untuk per-run kalau mau.
            $table->unsignedBigInteger('batch_id');

            $table->unsignedBigInteger('qc_control_id');

            // nilai QC yang diinput
            $table->decimal('value', 18, 6);

            // hasil hitung (optional)
            $table->decimal('z_score', 18, 6)->nullable();

            // array rule violations, contoh: ["1-2s"] / ["1-3s","R-4s"]
            if (DB::getDriverName() === 'pgsql') {
                $table->jsonb('violations')->nullable();
            } else {
                $table->json('violations')->nullable();
            }

            // pass|warning|fail
            $table->string('status', 16)->default('pass');

            // siapa yang input qc (staff)
            $table->unsignedBigInteger('created_by');

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // indexes (penting buat query ringan per batch)
            $table->index('batch_id', 'idx_qcruns_batch');
            $table->index('qc_control_id', 'idx_qcruns_control');
            $table->index(['batch_id', 'qc_control_id'], 'idx_qcruns_batch_control');
            $table->index('created_by', 'idx_qcruns_created_by');
        });

        // FK constraints
        Schema::table('qc_runs', function (Blueprint $table) {
            $table->foreign('qc_control_id', 'fk_qcruns_qc_controls')
                ->references('qc_control_id')->on('qc_controls')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            // created_by -> staffs.staff_id (sesuai pola audit_logs kamu yang staff_id wajib)
            $table->foreign('created_by', 'fk_qcruns_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // (Opsional) check status untuk Postgres biar rapi
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE qc_runs
                ADD CONSTRAINT chk_qcruns_status
                CHECK (status IN ('pass','warning','fail'));
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE qc_runs DROP CONSTRAINT IF EXISTS chk_qcruns_status;');
        }

        Schema::table('qc_runs', function (Blueprint $table) {
            $table->dropForeign('fk_qcruns_qc_controls');
            $table->dropForeign('fk_qcruns_staffs');
            $table->dropIndex('idx_qcruns_batch');
            $table->dropIndex('idx_qcruns_control');
            $table->dropIndex('idx_qcruns_batch_control');
            $table->dropIndex('idx_qcruns_created_by');
        });

        Schema::dropIfExists('qc_runs');
    }
};
