<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parameter_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('parameter_requests', 'request_type')) {
                $table->string('request_type', 10)->default('create')->after('id'); // create|update
                $table->index('request_type', 'idx_parameter_requests_type');
            }

            if (!Schema::hasColumn('parameter_requests', 'parameter_id')) {
                $table->unsignedBigInteger('parameter_id')->nullable()->after('request_type');
                $table->index('parameter_id', 'idx_parameter_requests_parameter_id');

                $table->foreign('parameter_id', 'fk_parameter_requests_parameter_id')
                    ->references('parameter_id')->on('parameters')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            }

            if (!Schema::hasColumn('parameter_requests', 'payload')) {
                // Postgres-friendly
                $table->jsonb('payload')->nullable()->after('reason'); // proposed changes
            }
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE parameter_requests
                ADD CONSTRAINT chk_parameter_requests_type
                CHECK (request_type IN ('create','update'));
            ");

            DB::statement("
                ALTER TABLE parameter_requests
                ADD CONSTRAINT chk_parameter_requests_update_requires_target
                CHECK (
                    request_type <> 'update'
                    OR (parameter_id IS NOT NULL AND payload IS NOT NULL)
                );
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_type;");
            DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_update_requires_target;");
        }

        Schema::table('parameter_requests', function (Blueprint $table) {
            if (Schema::hasColumn('parameter_requests', 'payload')) {
                $table->dropColumn('payload');
            }

            if (Schema::hasColumn('parameter_requests', 'parameter_id')) {
                try {
                    $table->dropForeign('fk_parameter_requests_parameter_id');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameter_requests_parameter_id');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('parameter_id');
            }

            if (Schema::hasColumn('parameter_requests', 'request_type')) {
                try {
                    $table->dropIndex('idx_parameter_requests_type');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('request_type');
            }
        });
    }
};
