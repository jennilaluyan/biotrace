<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reagent_calculations', function (Blueprint $table) {
            // audit enrichment (non-breaking)
            $table->timestampTz('om_approved_at')->nullable();

            // versioning for payload edits
            $table->integer('version_no')->default(1);

            // free text notes for review/approval
            $table->text('notes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('reagent_calculations', function (Blueprint $table) {
            $table->dropColumn('om_approved_at');
            $table->dropColumn('version_no');
            $table->dropColumn('notes');
        });
    }
};
