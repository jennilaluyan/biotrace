<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            if (!Schema::hasColumn('reports', 'request_batch_id')) {
                $table->uuid('request_batch_id')->nullable()->after('sample_id')->index();
            }

            if (!Schema::hasColumn('reports', 'batch_total')) {
                $table->unsignedInteger('batch_total')->default(1)->after('request_batch_id');
            }

            if (!Schema::hasColumn('reports', 'primary_sample_id')) {
                $table->unsignedBigInteger('primary_sample_id')->nullable()->after('batch_total');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            if (Schema::hasColumn('reports', 'primary_sample_id')) {
                $table->dropColumn('primary_sample_id');
            }
            if (Schema::hasColumn('reports', 'batch_total')) {
                $table->dropColumn('batch_total');
            }
            if (Schema::hasColumn('reports', 'request_batch_id')) {
                $table->dropColumn('request_batch_id');
            }
        });
    }
};
