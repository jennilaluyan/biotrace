<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staffs', function (Blueprint $table) {
            if (!Schema::hasColumn('staffs', 'locale')) {
                // 'id' or 'en'
                $table->string('locale', 8)->default('id');
            }
        });

        Schema::table('clients', function (Blueprint $table) {
            if (!Schema::hasColumn('clients', 'locale')) {
                $table->string('locale', 8)->default('id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('staffs', function (Blueprint $table) {
            if (Schema::hasColumn('staffs', 'locale')) {
                $table->dropColumn('locale');
            }
        });

        Schema::table('clients', function (Blueprint $table) {
            if (Schema::hasColumn('clients', 'locale')) {
                $table->dropColumn('locale');
            }
        });
    }
};
