<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('letters_of_order', function (Blueprint $table) {
            if (!Schema::hasColumn('letters_of_order', 'loa_status')) {
                $table->string('loa_status', 32)->default('draft')->after('file_url');
            }
            if (!Schema::hasColumn('letters_of_order', 'generated_by')) {
                $table->unsignedBigInteger('generated_by')->nullable()->after('generated_at');
            }
            if (!Schema::hasColumn('letters_of_order', 'sent_to_client_at')) {
                $table->timestampTz('sent_to_client_at')->nullable()->after('loa_status');
            }
            if (!Schema::hasColumn('letters_of_order', 'client_signed_at')) {
                $table->timestampTz('client_signed_at')->nullable()->after('sent_to_client_at');
            }
            if (!Schema::hasColumn('letters_of_order', 'locked_at')) {
                $table->timestampTz('locked_at')->nullable()->after('client_signed_at');
            }
            if (!Schema::hasColumn('letters_of_order', 'payload')) {
                // snapshot data agar dokumen stable
                $table->json('payload')->nullable()->after('locked_at');
            }
        });

        // CHECK constraint (Postgres only, consistent with sample request_status approach)
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE letters_of_order
                ADD CONSTRAINT chk_letters_of_order_status
                CHECK (loa_status IN (
                    'draft',
                    'signed_internal',
                    'sent_to_client',
                    'client_signed',
                    'locked'
                ));
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE letters_of_order DROP CONSTRAINT IF EXISTS chk_letters_of_order_status;");
        }

        Schema::table('letters_of_order', function (Blueprint $table) {
            $drop = [];
            foreach (['loa_status', 'generated_by', 'sent_to_client_at', 'client_signed_at', 'locked_at', 'payload'] as $c) {
                if (Schema::hasColumn('letters_of_order', $c)) $drop[] = $c;
            }
            if (!empty($drop)) $table->dropColumn($drop);
        });
    }
};
