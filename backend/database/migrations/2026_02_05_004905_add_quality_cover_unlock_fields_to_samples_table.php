<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'quality_cover_unlocked_at')) {
                $table->dateTime('quality_cover_unlocked_at')->nullable()->index();
            }
            if (!Schema::hasColumn('samples', 'quality_cover_unlocked_by_staff_id')) {
                $table->unsignedBigInteger('quality_cover_unlocked_by_staff_id')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasColumn('samples', 'quality_cover_unlocked_by_staff_id')) {
                $table->dropColumn('quality_cover_unlocked_by_staff_id');
            }
            if (Schema::hasColumn('samples', 'quality_cover_unlocked_at')) {
                $table->dropColumn('quality_cover_unlocked_at');
            }
        });
    }
};
