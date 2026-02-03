<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipment_catalog', function (Blueprint $table) {
            $table->bigIncrements('equipment_id');

            // Identity (from Excel: "KODE ALAT")
            $table->string('equipment_code', 80)->unique();

            // From Excel columns
            $table->string('name', 255)->index();                 // NAMA INSTRUMEN
            $table->string('manufacturer', 255)->nullable();      // MANUFAKTUR
            $table->string('model', 255)->nullable();             // TIPE/MODEL
            $table->string('serial_number', 255)->nullable();     // NOMOR SERIAL
            $table->string('distributor', 255)->nullable();       // DISTRIBUTOR DAN CONTACT PERSON
            $table->string('received_at_text', 100)->nullable();  // TANGGAL PENERIMAAN (sering format teks)
            $table->string('condition_tool', 100)->nullable();    // KONDISI ALAT
            $table->string('condition_physical', 100)->nullable(); // KONDISI FISIK
            $table->string('location', 255)->nullable()->index(); // LOKASI

            // Ownership/source label in Excel "Status" (mis: UNSRAT/DINKES/HARSEN/etc)
            $table->string('owner_status', 100)->nullable()->index();

            // Active flag (buat soft disable tanpa delete)
            $table->boolean('is_active')->default(true)->index();

            // Traceability for imports (Step 5.2)
            $table->string('source_file', 255)->nullable();
            $table->string('source_sheet', 100)->nullable();
            $table->unsignedInteger('source_row')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_catalog');
    }
};
