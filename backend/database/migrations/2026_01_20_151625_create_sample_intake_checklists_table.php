<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // ✅ Guard: kalau tabel sudah ada, jangan create lagi.
        if (Schema::hasTable('sample_intake_checklists')) {
            return;
        }

        Schema::create('sample_intake_checklists', function (Blueprint $table) {
            $table->bigIncrements('id');

            $table->unsignedBigInteger('sample_id')->unique();
            $table->foreign('sample_id')
                ->references('sample_id')
                ->on('samples')
                ->onDelete('cascade');

            // checklist JSON
            $table->json('checklist');

            $table->text('notes')->nullable();
            $table->boolean('is_passed')->default(false);

            $table->unsignedBigInteger('checked_by')->nullable();
            $table->foreign('checked_by')
                ->references('staff_id')
                ->on('staffs')
                ->nullOnDelete();

            $table->timestampTz('checked_at')->nullable();
            $table->timestampTz('created_at')->nullable();
            $table->timestampTz('updated_at')->nullable();
        });

        // Optional default {} untuk Postgres (hanya kalau barusan create)
        if (DB::getDriverName() === 'pgsql') {
            // kalau kamu pakai json (bukan jsonb), pakai '{}'::json
            DB::statement("ALTER TABLE sample_intake_checklists ALTER COLUMN checklist SET DEFAULT '{}'::json;");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sample_intake_checklists');
    }
};
