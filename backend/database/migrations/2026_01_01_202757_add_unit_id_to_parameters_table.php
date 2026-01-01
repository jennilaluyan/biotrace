<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parameters', function (Blueprint $table) {
            // nullable untuk backward compatibility (karena data lama masih pakai parameters.unit string)
            $table->unsignedBigInteger('unit_id')->nullable()->after('unit');

            $table->index('unit_id', 'idx_parameters_unit');
            $table->foreign('unit_id', 'fk_parameters_units')
                ->references('unit_id')->on('units')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('parameters', function (Blueprint $table) {
            $table->dropForeign('fk_parameters_units');
            $table->dropIndex('idx_parameters_unit');
            $table->dropColumn('unit_id');
        });
    }
};
