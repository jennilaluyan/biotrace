<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'request_return_note')) {
                $table->text('request_return_note')->nullable()->after('request_status');
            }
            if (!Schema::hasColumn('samples', 'request_approved_at')) {
                $table->timestampTz('request_approved_at')->nullable()->after('request_return_note');
            }
            if (!Schema::hasColumn('samples', 'request_returned_at')) {
                $table->timestampTz('request_returned_at')->nullable()->after('request_approved_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            $drop = [];
            foreach (['request_return_note', 'request_approved_at', 'request_returned_at'] as $c) {
                if (Schema::hasColumn('samples', $c)) $drop[] = $c;
            }
            if (!empty($drop)) $table->dropColumn($drop);
        });
    }
};