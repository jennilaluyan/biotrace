<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1) samples: add scheduled_delivery_at (portal field)
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'scheduled_delivery_at')) {
                // Place after received_at if exists, otherwise add at end
                if (Schema::hasColumn('samples', 'received_at')) {
                    $table->timestampTz('scheduled_delivery_at')->nullable()->after('received_at');
                } else {
                    $table->timestampTz('scheduled_delivery_at')->nullable();
                }
                $table->index('scheduled_delivery_at', 'idx_samples_scheduled_delivery_at');
            }
        });

        // 2) samples: drop legacy fields from request/sample flow
        // contact_history had CHECK constraint in initial migration -> must drop constraint first (pgsql)
        if (Schema::hasColumn('samples', 'contact_history')) {
            if (DB::getDriverName() === 'pgsql') {
                DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_contact_history;");
            }
            Schema::table('samples', function (Blueprint $table) {
                // drop column safely
                try {
                    $table->dropColumn('contact_history');
                } catch (\Throwable $e) {
                    // ignore if driver can't drop in this context
                }
            });
        }

        if (Schema::hasColumn('samples', 'priority')) {
            Schema::table('samples', function (Blueprint $table) {
                try {
                    $table->dropColumn('priority');
                } catch (\Throwable $e) {
                    // ignore
                }
            });
        }

        // 3) Create pivot table for requested parameters (works for draft/submitted/admin-created)
        if (!Schema::hasTable('sample_requested_parameters')) {
            Schema::create('sample_requested_parameters', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('sample_id');
                $table->unsignedBigInteger('parameter_id');
                $table->timestampTz('created_at')->useCurrent();
                $table->timestampTz('updated_at')->nullable();

                $table->unique(['sample_id', 'parameter_id'], 'uq_sample_requested_params');

                $table->index('sample_id', 'idx_srp_sample');
                $table->index('parameter_id', 'idx_srp_parameter');

                $table->foreign('sample_id', 'fk_srp_sample')
                    ->references('sample_id')->on('samples')
                    ->cascadeOnUpdate()
                    ->cascadeOnDelete();

                $table->foreign('parameter_id', 'fk_srp_parameter')
                    ->references('parameter_id')->on('parameters')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        // drop pivot first
        if (Schema::hasTable('sample_requested_parameters')) {
            Schema::table('sample_requested_parameters', function (Blueprint $table) {
                $table->dropForeign('fk_srp_sample');
                $table->dropForeign('fk_srp_parameter');
                $table->dropUnique('uq_sample_requested_params');
                $table->dropIndex('idx_srp_sample');
                $table->dropIndex('idx_srp_parameter');
            });
            Schema::dropIfExists('sample_requested_parameters');
        }

        // revert samples columns (best-effort)
        Schema::table('samples', function (Blueprint $table) {
            if (Schema::hasColumn('samples', 'scheduled_delivery_at')) {
                try {
                    $table->dropIndex('idx_samples_scheduled_delivery_at');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropColumn('scheduled_delivery_at');
                } catch (\Throwable $e) {
                }
            }
        });

        // add back priority + contact_history (best-effort, pgsql constraint restored)
        Schema::table('samples', function (Blueprint $table) {
            if (!Schema::hasColumn('samples', 'priority')) {
                $table->smallInteger('priority')->default(0);
            }
            if (!Schema::hasColumn('samples', 'contact_history')) {
                $table->string('contact_history', 12)->nullable();
            }
        });

        if (DB::getDriverName() === 'pgsql') {
            // restore contact_history CHECK constraint (same as old migration)
            DB::statement("
                ALTER TABLE samples
                ADD CONSTRAINT chk_samples_contact_history
                CHECK (
                    contact_history IS NULL
                    OR contact_history IN ('ada','tidak','tidak_tahu')
                );
            ");
        }
    }
};