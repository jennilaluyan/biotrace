<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            // Soft delete pakai timestamp dengan timezone (biar konsisten sama yang lain)
            $table->softDeletesTz();
            // ini otomatis buat kolom: deleted_at TIMESTAMPTZ NULL
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropSoftDeletesTz();
            // atau kalau pakai Laravel versi yang belum punya dropSoftDeletesTz:
            // $table->dropColumn('deleted_at');
        });
    }
};
