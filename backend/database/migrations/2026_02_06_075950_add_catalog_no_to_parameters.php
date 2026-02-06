<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parameters', function (Blueprint $table) {
            if (!Schema::hasColumn('parameters', 'catalog_no')) {
                $table->unsignedSmallInteger('catalog_no')->nullable()->after('parameter_id');
                $table->index('catalog_no', 'idx_parameters_catalog_no');
                $table->unique('catalog_no', 'uq_parameters_catalog_no');
            }
        });
    }

    public function down(): void
    {
        Schema::table('parameters', function (Blueprint $table) {
            if (Schema::hasColumn('parameters', 'catalog_no')) {
                try {
                    $table->dropUnique('uq_parameters_catalog_no');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameters_catalog_no');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('catalog_no');
            }
        });
    }
};
