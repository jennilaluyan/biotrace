<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('files', function (Blueprint $table) {
            $table->bigIncrements('file_id');

            $table->string('original_name');
            $table->string('ext', 16);
            $table->string('mime_type', 128)->nullable();

            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->char('sha256', 64)->index();

            // Base type: BLOB (we will bump to LONGBLOB on MySQL/MariaDB)
            $table->binary('bytes');

            // who uploaded (staff)
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            // FK staff (project kamu pakai table "staffs" dan PK "staff_id")
            if (Schema::hasTable('staffs')) {
                $table->foreign('created_by', 'fk_files_created_by_staffs')
                    ->references('staff_id')->on('staffs')
                    ->cascadeOnUpdate()
                    ->nullOnDelete();
            }
        });

        // Ensure capacity for large PDFs/DOCX (MySQL/MariaDB only)
        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE files MODIFY bytes LONGBLOB');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('files');
    }
};