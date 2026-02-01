<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use App\Enums\SampleRequestStatus;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            $addIfMissing = function (string $name, callable $def) use ($table) {
                if (!Schema::hasColumn('samples', $name)) {
                    $def($table);
                }
            };

            // ✅ Verification gate fields
            $addIfMissing('verified_at', function (Blueprint $t) {
                $t->timestampTz('verified_at')->nullable();
            });

            $addIfMissing('verified_by_staff_id', function (Blueprint $t) {
                $t->unsignedBigInteger('verified_by_staff_id')->nullable();
            });

            $addIfMissing('verified_by_role', function (Blueprint $t) {
                $t->string('verified_by_role', 32)->nullable(); // "OM" / "LH"
            });

            // ✅ LOA metadata (created/generated)
            $addIfMissing('loa_generated_at', function (Blueprint $t) {
                $t->timestampTz('loa_generated_at')->nullable();
            });

            $addIfMissing('loa_generated_by_staff_id', function (Blueprint $t) {
                $t->unsignedBigInteger('loa_generated_by_staff_id')->nullable();
            });
        });

        // Foreign keys (guarded)
        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasTable('staffs')) {
                if (Schema::hasColumn('samples', 'verified_by_staff_id')) {
                    // add FK only if not exists (best-effort for pgsql)
                    try {
                        $table->foreign('verified_by_staff_id')
                            ->references('staff_id')
                            ->on('staffs')
                            ->nullOnDelete();
                    } catch (\Throwable $e) {
                        // ignore if already exists
                    }
                }

                if (Schema::hasColumn('samples', 'loa_generated_by_staff_id')) {
                    try {
                        $table->foreign('loa_generated_by_staff_id')
                            ->references('staff_id')
                            ->on('staffs')
                            ->nullOnDelete();
                    } catch (\Throwable $e) {
                        // ignore if already exists
                    }
                }
            }
        });

        // ✅ Update Postgres CHECK constraint (allowed request_status list)
        if (DB::getDriverName() === 'pgsql') {
            $allowed = SampleRequestStatus::values();
            $allowedSql = "'" . implode("','", array_map(
                fn($v) => str_replace("'", "''", $v),
                $allowed
            )) . "'";

            DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");
            DB::statement("
                ALTER TABLE samples
                ADD CONSTRAINT chk_samples_request_status
                CHECK (request_status IS NULL OR request_status IN ($allowedSql))
            ");
        }
    }

    public function down(): void
    {
        // Rollback constraint first (pgsql)
        if (DB::getDriverName() === 'pgsql') {
            // Remove AWAITING_VERIFICATION from allowed list on rollback
            $allowed = array_values(array_filter(
                SampleRequestStatus::values(),
                fn($v) => $v !== SampleRequestStatus::AWAITING_VERIFICATION->value
            ));

            $allowedSql = "'" . implode("','", array_map(
                fn($v) => str_replace("'", "''", $v),
                $allowed
            )) . "'";

            DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status");
            DB::statement("
                ALTER TABLE samples
                ADD CONSTRAINT chk_samples_request_status
                CHECK (request_status IS NULL OR request_status IN ($allowedSql))
            ");
        }

        // Drop columns (guarded)
        Schema::table('samples', function (Blueprint $table) {
            $dropIfExists = function (string $name) use ($table) {
                if (Schema::hasColumn('samples', $name)) {
                    try {
                        $table->dropColumn($name);
                    } catch (\Throwable $e) {
                        // ignore
                    }
                }
            };

            // Drop FKs best-effort (names can vary)
            try {
                $table->dropForeign(['verified_by_staff_id']);
            } catch (\Throwable $e) {
            }
            try {
                $table->dropForeign(['loa_generated_by_staff_id']);
            } catch (\Throwable $e) {
            }

            $dropIfExists('loa_generated_by_staff_id');
            $dropIfExists('loa_generated_at');
            $dropIfExists('verified_by_role');
            $dropIfExists('verified_by_staff_id');
            $dropIfExists('verified_at');
        });
    }
};
