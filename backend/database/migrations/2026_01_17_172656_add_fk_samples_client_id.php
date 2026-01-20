<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            $table->foreign('client_id', 'fk_samples_clients')
                ->references('client_id')
                ->on('clients')
                ->onDelete('restrict');
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            $table->dropForeign('fk_samples_clients');
        });
    }
};
