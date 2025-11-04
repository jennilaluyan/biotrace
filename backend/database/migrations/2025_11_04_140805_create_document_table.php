<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            // Primary key
            $table->bigIncrements('doc_id');

            // Document info
            $table->string('title', 150);
            $table->text('path');
            $table->string('visible_to_role', 50)->nullable();

            // Current version pointer
            $table->unsignedBigInteger('version_current_id')->nullable();

            // System timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('visible_to_role', 'idx_docs_visible');
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropIndex('idx_docs_visible');
        });

        Schema::dropIfExists('documents');
    }
};
