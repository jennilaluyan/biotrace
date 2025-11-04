<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            // Primary key
            $table->bigIncrements('log_id');

            // Actor
            $table->unsignedBigInteger('staff_id');

            // Target entity 
            $table->string('entity_name', 80);
            $table->unsignedBigInteger('entity_id');

            // Action verb & metadata
            $table->string('action', 40);
            $table->timestampTz('timestamp')->useCurrent();
            $table->string('ip_address', 45)->nullable();

            // Before/after snapshots 
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();

            // Index
            $table->index('staff_id', 'idx_audit_staff');
            $table->index(['entity_name', 'entity_id'], 'idx_audit_entity');

            // FK
            $table->foreign('staff_id', 'fk_audit_staffs_actor')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        DB::statement(
            "ALTER TABLE audit_logs
             ADD CONSTRAINT chk_audit_action
             CHECK (action ~ '^[A-Z_]+$')"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;');

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropForeign('fk_audit_staffs_actor');
            $table->dropIndex('idx_audit_staff');
            $table->dropIndex('idx_audit_entity');
        });

        Schema::dropIfExists('audit_logs');
    }
};
