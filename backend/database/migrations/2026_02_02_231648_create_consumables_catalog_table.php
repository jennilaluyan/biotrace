<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('consumables_catalog', function (Blueprint $table) {
            $table->bigIncrements('catalog_id');

            // Type sumber: BHP vs REAGEN (sesuai sheet Excel)
            $table->enum('item_type', ['bhp', 'reagen'])->index();

            // Master identity
            $table->string('name', 255)->index();
            $table->string('specification', 255)->nullable(); // Excel: SPESIFIKASI/LOT (kadang kosong)

            // Default unit (kalau bisa dimapping ke table units)
            $table->unsignedBigInteger('default_unit_id')->nullable();
            $table->string('default_unit_text', 100)->nullable(); // fallback raw text (mis: "500 mL", "10 rack")

            // Optional: grouping/category nanti bisa dipakai untuk UI filtering
            $table->string('category', 100)->nullable()->index();

            // Active flag untuk “soft disable” tanpa hapus record
            $table->boolean('is_active')->default(true)->index();

            // Traceability import (biar gampang debug pas importer Step 4.2)
            $table->string('source_file', 255)->nullable();
            $table->string('source_sheet', 100)->nullable();
            $table->unsignedInteger('source_row')->nullable();

            $table->timestamps();

            // Prevent duplicate noisy imports
            $table->unique(['item_type', 'name', 'specification'], 'uq_catalog_item_name_spec');
        });

        // FK dipisah biar aman kalau engine/driver beda
        Schema::table('consumables_catalog', function (Blueprint $table) {
            // units table di project kamu pakai unit_id (bukan id)
            $table->foreign('default_unit_id')
                ->references('unit_id')
                ->on('units')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('consumables_catalog', function (Blueprint $table) {
            $table->dropForeign(['default_unit_id']);
        });

        Schema::dropIfExists('consumables_catalog');
    }
};