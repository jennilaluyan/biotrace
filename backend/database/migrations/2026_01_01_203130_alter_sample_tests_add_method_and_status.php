<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sample_tests', function (Blueprint $table) {
            // 1) Method relation (nullable untuk backward compatibility)
            $table->unsignedBigInteger('method_id')->nullable()->after('parameter_id');

            // 2) Status untuk mempercepat filter UI (jangan menghapus flag yang sudah ada)
            $table->string('status', 25)->default('queued')->after('completed_at');

            // Indexes
            $table->index('method_id', 'idx_sampletests_method');
            $table->index('status', 'idx_sampletests_status');

            // FK
            $table->foreign('method_id', 'fk_sampletests_methods')
                ->references('method_id')->on('methods')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // CHECK constraint untuk status (PostgreSQL)
        DB::statement("
            ALTER TABLE sample_tests
            ADD CONSTRAINT chk_sampletests_status
            CHECK (status IN (
                'queued',
                'in_progress',
                'testing_completed',
                'verified',
                'validated',
                'cancelled',
                'failed'
            ));
        ");
    }

    public function down(): void
    {
        // Drop CHECK constraint
        DB::statement('ALTER TABLE sample_tests DROP CONSTRAINT IF EXISTS chk_sampletests_status;');

        Schema::table('sample_tests', function (Blueprint $table) {
            $table->dropForeign('fk_sampletests_methods');
            $table->dropIndex('idx_sampletests_method');
            $table->dropIndex('idx_sampletests_status');

            $table->dropColumn('method_id');
            $table->dropColumn('status');
        });
    }
};
