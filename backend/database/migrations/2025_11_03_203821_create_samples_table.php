<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('samples', function (Blueprint $table) {
            // PK
            $table->bigIncrements('sample_id');

            // FK to clients.client_id (pemohon dari form)
            $table->unsignedBigInteger('client_id');

            // Waktu sampel diterima di lab
            $table->timestampTz('received_at');

            // Jenis sampel dari form:
            // contoh: darah, urine, swab nasofaring & orofaring, lainnya
            $table->string('sample_type', 80);

            // Tujuan pemeriksaan dari form (screening/diagnosis/dll)
            $table->string('examination_purpose', 150)->nullable();

            // Kontak erat (khusus kasus tertentu, mis. covid):
            // 'ada', 'tidak', 'tidak_tahu' / null jika tidak relevan
            $table->string('contact_history', 12)->nullable();

            // Prioritas permintaan
            $table->smallInteger('priority')->default(0);

            // Status workflow sampel
            $table->string('current_status', 20);

            // Keterangan tambahan dari form permintaan
            $table->text('additional_notes')->nullable();

            // Staf yang membuat entri (traceability)
            $table->unsignedBigInteger('created_by');

            // Indexes
            $table->index('client_id', 'idx_samples_client');
            $table->index('created_by', 'idx_samples_creator');
            $table->index('current_status', 'idx_samples_status');

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

        // CHECK: status sesuai workflow
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_status
            CHECK (current_status IN (
                'received',
                'in_progress',
                'testing_completed',
                'verified',
                'validated',
                'reported'
            ));
        ");

        // CHECK: contact_history konsisten (boleh null)
        DB::statement("
            ALTER TABLE samples
            ADD CONSTRAINT chk_samples_contact_history
            CHECK (
                contact_history IS NULL
                OR contact_history IN ('ada','tidak','tidak_tahu')
            );
        ");
    }

    public function down(): void
    {
        // Drop CHECK constraints
        DB::statement('ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_status;');
        DB::statement('ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_contact_history;');

        // Drop FKs & indexes
        Schema::table('samples', function (Blueprint $table) {
            $table->dropForeign('fk_samples_client');
            $table->dropForeign('fk_samples_staffs_creator');
            $table->dropIndex('idx_samples_client');
            $table->dropIndex('idx_samples_creator');
            $table->dropIndex('idx_samples_status');
        });

        Schema::dropIfExists('samples');
    }
};
