<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('test_results', function (Blueprint $table) {
            // nilai mentah & final (text biar fleksibel: angka, Ct, "positive", dll)
            $table->text('value_raw')->nullable();
            $table->text('value_final')->nullable();

            // unit relasi ke units (nullable untuk backward compatibility)
            $table->unsignedBigInteger('unit_id')->nullable();

            // flags fleksibel untuk Postgres (jsonb)
            $table->jsonb('flags')->default(DB::raw("'{}'::jsonb"));

            // indexes
            $table->index('unit_id', 'idx_testresults_unit');
        });

        // FK constraint (nullOnDelete biar aman kalau unit dihapus)
        Schema::table('test_results', function (Blueprint $table) {
            $table->foreign('unit_id', 'fk_testresults_units')
                ->references('unit_id')->on('units')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        // drop FK + index + columns
        Schema::table('test_results', function (Blueprint $table) {
            $table->dropForeign('fk_testresults_units');
            $table->dropIndex('idx_testresults_unit');

            $table->dropColumn('value_raw');
            $table->dropColumn('value_final');
            $table->dropColumn('unit_id');
            $table->dropColumn('flags');
        });
    }
};
