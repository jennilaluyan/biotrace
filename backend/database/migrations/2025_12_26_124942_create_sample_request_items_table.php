<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sample_request_items', function (Blueprint $table) {
            $table->bigIncrements('id');

            $table->unsignedBigInteger('request_id');
            $table->unsignedBigInteger('parameter_id');

            // optional: kalau nanti ada tabel methods, bisa diganti jadi method_id FK
            $table->string('method_ref', 120)->nullable();

            $table->text('notes')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->index('request_id', 'idx_sri_request');
            $table->index('parameter_id', 'idx_sri_parameter');

            // 1 parameter hanya sekali per request
            $table->unique(['request_id', 'parameter_id'], 'uq_sri_request_param');

            $table->foreign('request_id', 'fk_sri_sample_requests')
                ->references('request_id')->on('sample_requests')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('parameter_id', 'fk_sri_parameters')
                ->references('parameter_id')->on('parameters')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sample_request_items', function (Blueprint $table) {
            $table->dropForeign('fk_sri_sample_requests');
            $table->dropForeign('fk_sri_parameters');

            $table->dropIndex('idx_sri_request');
            $table->dropIndex('idx_sri_parameter');
            $table->dropUnique('uq_sri_request_param');
        });

        Schema::dropIfExists('sample_request_items');
    }
};
