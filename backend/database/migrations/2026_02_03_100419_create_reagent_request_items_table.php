<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reagent_request_items', function (Blueprint $table) {
            $table->bigIncrements('reagent_request_item_id');

            $table->unsignedBigInteger('reagent_request_id');

            // Optional: chosen from imported catalog (consumables/reagents)
            $table->unsignedBigInteger('catalog_item_id')->nullable();

            // Snapshot fields (so request still readable if catalog changes)
            $table->string('item_type', 16)->nullable(); // bhp | reagen
            $table->string('item_name', 255);
            $table->string('specification', 255)->nullable();

            // Quantity + unit
            $table->decimal('qty', 12, 3)->default(0);
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->string('unit_text', 64)->nullable();

            $table->unsignedInteger('sort_order')->default(0);
            $table->text('note')->nullable();

            $table->timestamps();

            // Indexes
            $table->index(['reagent_request_id'], 'idx_req_items_request');
            $table->index(['catalog_item_id'], 'idx_req_items_catalog');

            // FKs
            $table->foreign('reagent_request_id')
                ->references('reagent_request_id')
                ->on('reagent_requests')
                ->cascadeOnDelete();

            $table->foreign('catalog_item_id')
                ->references('catalog_id')
                ->on('consumables_catalog')
                ->nullOnDelete();

            $table->foreign('unit_id')
                ->references('unit_id')
                ->on('units')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reagent_request_items');
    }
};
