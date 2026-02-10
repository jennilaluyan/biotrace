<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BackfillQualityCoverParameters extends Command
{
    protected $signature = 'qc:backfill-params {--dry-run : Only print changes, do not write}';
    protected $description = 'Backfill quality_covers.parameter_id/parameter_label from sample_tests + parameters';

    public function handle(): int
    {
        if (!Schema::hasTable('quality_covers')) {
            $this->error('quality_covers table not found.');
            return 1;
        }

        if (!Schema::hasTable('sample_tests') || !Schema::hasTable('parameters')) {
            $this->error('sample_tests/parameters table not found.');
            return 1;
        }

        $dry = (bool) $this->option('dry-run');

        $covers = DB::table('quality_covers')
            ->select(['quality_cover_id', 'sample_id', 'parameter_id', 'parameter_label'])
            ->where(function ($q) {
                $q->whereNull('parameter_label')->orWhere('parameter_label', '');
            })
            ->orderBy('quality_cover_id')
            ->get();

        $updated = 0;

        foreach ($covers as $qc) {
            $rows = DB::table('sample_tests')
                ->join('parameters', 'parameters.parameter_id', '=', 'sample_tests.parameter_id')
                ->where('sample_tests.sample_id', (int) $qc->sample_id)
                ->select(['parameters.parameter_id', 'parameters.name'])
                ->distinct()
                ->get();

            if ($rows->isEmpty()) continue;

            $names = $rows->pluck('name')->filter()->values()->all();
            $label = implode(', ', $names);

            $pid = null;
            $ids = $rows->pluck('parameter_id')->filter()->unique()->values()->all();
            if (count($ids) === 1) $pid = (int) $ids[0];

            if ($dry) {
                $this->line("QC #{$qc->quality_cover_id} sample={$qc->sample_id} -> parameter_id=" . ($pid ?? 'null') . " label={$label}");
                continue;
            }

            DB::table('quality_covers')
                ->where('quality_cover_id', (int) $qc->quality_cover_id)
                ->update([
                    'parameter_id' => $pid,
                    'parameter_label' => $label,
                    'updated_at' => now(),
                ]);

            $updated++;
        }

        $this->info("Done. Updated {$updated} quality cover rows.");
        return 0;
    }
}
