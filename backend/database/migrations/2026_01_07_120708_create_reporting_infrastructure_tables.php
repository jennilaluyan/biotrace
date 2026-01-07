<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        /**
         * Signature role reference (seed: QA_MANAGER, LH)
         */
        Schema::create('report_signature_roles', function (Blueprint $table) {
            $table->string('role_code', 24)->primary();  // e.g. QA_MANAGER, LH
            $table->string('role_name', 60);
            $table->smallInteger('sort_order')->default(0);
            $table->boolean('is_required')->default(true);

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();
        });

        /**
         * Report signatures (slot per role; signer may be null until signed)
         */
        Schema::create('report_signatures', function (Blueprint $table) {
            $table->bigIncrements('signature_id');

            $table->unsignedBigInteger('report_id');
            $table->string('role_code', 24);

            $table->unsignedBigInteger('signed_by')->nullable();
            $table->timestampTz('signed_at')->nullable();

            // Infrastructure for later “digital lock”
            $table->string('signature_hash', 128)->nullable();
            $table->text('note')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Constraints / indexes
            $table->unique(['report_id', 'role_code'], 'uq_report_signatures_report_role');
            $table->index('signed_by', 'idx_report_signatures_signed_by');
            $table->index('report_id', 'idx_report_signatures_report');

            // FK
            $table->foreign('report_id', 'fk_report_signatures_reports')
                ->references('report_id')->on('reports')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('role_code', 'fk_report_signatures_roles')
                ->references('role_code')->on('report_signature_roles')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('signed_by', 'fk_report_signatures_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        /**
         * Report items = snapshot hasil uji (stable record)
         */
        Schema::create('report_items', function (Blueprint $table) {
            $table->bigIncrements('report_item_id');

            $table->unsignedBigInteger('report_id');
            $table->unsignedBigInteger('sample_test_id')->nullable();

            // Snapshot columns (do NOT depend on master data after report issued)
            $table->string('parameter_name', 120);
            $table->string('method_name', 120)->nullable();

            // Use TEXT to support numeric + qualitative results safely
            $table->text('result_value')->nullable();
            $table->string('unit_label', 40)->nullable();

            // flags/extra info (json)
            $table->json('flags')->nullable();
            $table->text('interpretation')->nullable();

            // When the test was completed / validated (optional snapshot)
            $table->timestampTz('tested_at')->nullable();

            // Display ordering in report
            $table->smallInteger('order_no')->default(0);

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('report_id', 'idx_report_items_report');
            $table->index(['report_id', 'order_no'], 'idx_report_items_report_order');
            $table->index('sample_test_id', 'idx_report_items_sample_test');

            // FK
            $table->foreign('report_id', 'fk_report_items_reports')
                ->references('report_id')->on('reports')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('sample_test_id', 'fk_report_items_sample_tests')
                ->references('sample_test_id')->on('sample_tests')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        /**
         * Counter for report number sequence (SEQ continues forever)
         */
        Schema::create('report_counters', function (Blueprint $table) {
            $table->string('counter_key', 32)->primary(); // e.g. "REPORT_NO"
            $table->unsignedBigInteger('next_seq')->default(1);

            $table->timestampTz('updated_at')->useCurrent();
        });

        // Seed the single counter row (safe / idempotent)
        DB::table('report_counters')->insert([
            'counter_key' => 'REPORT_NO',
            'next_seq' => 1,
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        // drop in reverse dependency order
        Schema::dropIfExists('report_items');
        Schema::dropIfExists('report_signatures');
        Schema::dropIfExists('report_signature_roles');
        Schema::dropIfExists('report_counters');
    }
};
