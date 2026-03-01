<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parameters', function (Blueprint $table) {
            if (!Schema::hasColumn('parameters', 'workflow_group')) {
                // Store deterministic grouping for new params (pcr|sequencing|rapid|microbiology)
                $table->string('workflow_group', 20)->nullable()->after('catalog_no');
                $table->index('workflow_group', 'idx_parameters_workflow_group');
            }
        });

        // Guard rails
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE parameters
                ADD CONSTRAINT chk_parameters_workflow_group
                CHECK (
                    workflow_group IS NULL
                    OR workflow_group IN ('pcr','sequencing','rapid','microbiology')
                );
            ");
        }

        // Backfill existing P01..P32 based on catalog_no ranges (best-effort)
        if (Schema::hasColumn('parameters', 'catalog_no') && Schema::hasColumn('parameters', 'workflow_group')) {
            $now = now();

            DB::table('parameters')
                ->whereNull('workflow_group')
                ->whereBetween('catalog_no', [1, 11])
                ->update(['workflow_group' => 'pcr', 'updated_at' => $now]);

            DB::table('parameters')
                ->whereNull('workflow_group')
                ->whereBetween('catalog_no', [12, 17])
                ->update(['workflow_group' => 'sequencing', 'updated_at' => $now]);

            DB::table('parameters')
                ->whereNull('workflow_group')
                ->whereBetween('catalog_no', [18, 19])
                ->update(['workflow_group' => 'rapid', 'updated_at' => $now]);

            DB::table('parameters')
                ->whereNull('workflow_group')
                ->whereBetween('catalog_no', [20, 32])
                ->update(['workflow_group' => 'microbiology', 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE parameters DROP CONSTRAINT IF EXISTS chk_parameters_workflow_group;");
        }

        Schema::table('parameters', function (Blueprint $table) {
            if (Schema::hasColumn('parameters', 'workflow_group')) {
                try {
                    $table->dropIndex('idx_parameters_workflow_group');
                } catch (\Throwable $e) {
                }
                $table->dropColumn('workflow_group');
            }
        });
    }
};