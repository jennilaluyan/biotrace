<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1) Sequence table for concurrency-safe Pxx assignment (row-lock later in approval step)
        if (!Schema::hasTable('parameter_code_sequences')) {
            Schema::create('parameter_code_sequences', function (Blueprint $table) {
                $table->bigIncrements('id');

                // One row per sequence type (we only need one now)
                $table->string('name', 40)->unique(); // e.g. "parameter"

                // next catalog number to allocate (e.g. 33 means next approved parameter => P33)
                $table->unsignedInteger('next_number');

                $table->timestampTz('created_at')->useCurrent();
                $table->timestampTz('updated_at')->nullable();
            });

            if (DB::getDriverName() === 'pgsql') {
                DB::statement("
                    ALTER TABLE parameter_code_sequences
                    ADD CONSTRAINT chk_parameter_code_sequences_next_number
                    CHECK (next_number >= 1);
                ");
            }
        }

        // Initialize the "parameter" sequence row if missing
        $hasSeqRow = DB::table('parameter_code_sequences')
            ->where('name', 'parameter')
            ->exists();

        if (!$hasSeqRow) {
            $maxCatalogNo = 0;
            if (Schema::hasTable('parameters') && Schema::hasColumn('parameters', 'catalog_no')) {
                $maxCatalogNo = (int) (DB::table('parameters')->max('catalog_no') ?? 0);
            }

            // Fallback: parse from code when catalog_no is null on older rows
            $maxFromCode = 0;
            if (Schema::hasTable('parameters') && Schema::hasColumn('parameters', 'code')) {
                $codes = DB::table('parameters')->select('code')->get();
                foreach ($codes as $row) {
                    $code = trim((string) ($row->code ?? ''));
                    if ($code === '') continue;

                    // P01..P999.. (any length >= 2 digits is OK)
                    if (preg_match('/^P(\d{2,})$/i', $code, $m)) {
                        $n = (int) $m[1];
                        if ($n > $maxFromCode) $maxFromCode = $n;
                        continue;
                    }

                    // BM-001..BM-999 legacy
                    if (preg_match('/^BM-(\d{3,})$/i', $code, $m)) {
                        $n = (int) $m[1];
                        if ($n > $maxFromCode) $maxFromCode = $n;
                        continue;
                    }
                }
            }

            $maxExisting = max($maxCatalogNo, $maxFromCode);

            // Business rule: requests start at P33+ (since P01..P32 are master)
            $next = max(33, $maxExisting + 1);

            DB::table('parameter_code_sequences')->insert([
                'name' => 'parameter',
                'next_number' => $next,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // 2) Parameter requests table
        if (!Schema::hasTable('parameter_requests')) {
            Schema::create('parameter_requests', function (Blueprint $table) {
                $table->bigIncrements('id');

                $table->string('parameter_name', 150);
                $table->string('category', 20)->default('microbiology'); // pcr|sequencing|rapid|microbiology
                $table->text('reason')->nullable();

                // lowercase, UI-ready
                $table->string('status', 10)->default('pending'); // pending|approved|rejected

                // Traceability to staffs (consistent with parameters.created_by)
                $table->unsignedBigInteger('requested_by');
                $table->timestampTz('requested_at')->useCurrent();

                $table->unsignedBigInteger('decided_by')->nullable();
                $table->timestampTz('decided_at')->nullable();
                $table->text('decision_note')->nullable();

                $table->unsignedBigInteger('approved_parameter_id')->nullable();

                $table->timestampTz('created_at')->useCurrent();
                $table->timestampTz('updated_at')->nullable();

                $table->index('status', 'idx_parameter_requests_status');
                $table->index('category', 'idx_parameter_requests_category');
                $table->index('requested_by', 'idx_parameter_requests_requested_by');
                $table->index('requested_at', 'idx_parameter_requests_requested_at');
                $table->index('decided_by', 'idx_parameter_requests_decided_by');
                $table->index('decided_at', 'idx_parameter_requests_decided_at');

                $table->foreign('requested_by', 'fk_parameter_requests_requested_by')
                    ->references('staff_id')->on('staffs')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();

                $table->foreign('decided_by', 'fk_parameter_requests_decided_by')
                    ->references('staff_id')->on('staffs')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();

                $table->foreign('approved_parameter_id', 'fk_parameter_requests_approved_parameter')
                    ->references('parameter_id')->on('parameters')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            });

            // DB-level guard rails (Postgres only)
            if (DB::getDriverName() === 'pgsql') {
                DB::statement("
                    ALTER TABLE parameter_requests
                    ADD CONSTRAINT chk_parameter_requests_status
                    CHECK (status IN ('pending','approved','rejected'));
                ");

                DB::statement("
                    ALTER TABLE parameter_requests
                    ADD CONSTRAINT chk_parameter_requests_category
                    CHECK (category IN ('pcr','sequencing','rapid','microbiology'));
                ");

                // If rejected -> decision_note must exist
                DB::statement("
                    ALTER TABLE parameter_requests
                    ADD CONSTRAINT chk_parameter_requests_reject_note
                    CHECK (
                        status <> 'rejected'
                        OR (decision_note IS NOT NULL AND length(btrim(decision_note)) > 0)
                    );
                ");

                // If approved -> approved_parameter_id must exist
                DB::statement("
                    ALTER TABLE parameter_requests
                    ADD CONSTRAINT chk_parameter_requests_approved_param
                    CHECK (
                        status <> 'approved'
                        OR approved_parameter_id IS NOT NULL
                    );
                ");

                // If decided (approved/rejected) -> decided_by & decided_at must exist
                DB::statement("
                    ALTER TABLE parameter_requests
                    ADD CONSTRAINT chk_parameter_requests_decision_fields
                    CHECK (
                        status = 'pending'
                        OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
                    );
                ");
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            // Drop constraints safely (tables might already be gone in some rollback states)
            try {
                DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_status;");
                DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_category;");
                DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_reject_note;");
                DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_approved_param;");
                DB::statement("ALTER TABLE parameter_requests DROP CONSTRAINT IF EXISTS chk_parameter_requests_decision_fields;");
            } catch (\Throwable $e) {
            }

            try {
                DB::statement("ALTER TABLE parameter_code_sequences DROP CONSTRAINT IF EXISTS chk_parameter_code_sequences_next_number;");
            } catch (\Throwable $e) {
            }
        }

        // Drop requests table first (it has FK -> parameters, staffs)
        if (Schema::hasTable('parameter_requests')) {
            Schema::table('parameter_requests', function (Blueprint $table) {
                try {
                    $table->dropForeign('fk_parameter_requests_requested_by');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropForeign('fk_parameter_requests_decided_by');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropForeign('fk_parameter_requests_approved_parameter');
                } catch (\Throwable $e) {
                }

                try {
                    $table->dropIndex('idx_parameter_requests_status');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameter_requests_category');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameter_requests_requested_by');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameter_requests_requested_at');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameter_requests_decided_by');
                } catch (\Throwable $e) {
                }
                try {
                    $table->dropIndex('idx_parameter_requests_decided_at');
                } catch (\Throwable $e) {
                }
            });

            Schema::dropIfExists('parameter_requests');
        }

        if (Schema::hasTable('parameter_code_sequences')) {
            Schema::dropIfExists('parameter_code_sequences');
        }
    }
};