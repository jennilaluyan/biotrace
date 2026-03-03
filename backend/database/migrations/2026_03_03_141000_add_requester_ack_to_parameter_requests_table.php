<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parameter_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('parameter_requests', 'requester_ack_at')) {
                // Requester (admin/analyst yang mengajukan) menandai sudah membaca keputusan.
                $table->timestampTz('requester_ack_at')->nullable()->after('decided_at');
                $table->index('requester_ack_at', 'idx_parameter_requests_requester_ack_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('parameter_requests', function (Blueprint $table) {
            if (Schema::hasColumn('parameter_requests', 'requester_ack_at')) {
                try {
                    $table->dropIndex('idx_parameter_requests_requester_ack_at');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('requester_ack_at');
            }
        });
    }
};