<?php

namespace App\Console\Commands;

use App\Models\Sample;
use App\Services\WorkflowGroupResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BackfillSampleWorkflowGroup extends Command
{
    protected $signature = 'samples:backfill-workflow-group
        {--dry-run : Show what would change without writing}
        {--limit=0 : Max number of samples to process (0 = unlimited)}
        {--chunk=200 : Chunk size for scanning}
        {--only-null : Only update samples where workflow_group is NULL (default true)}';

    protected $description = 'Backfill samples.workflow_group based on requested parameter ids (pivot sample_requested_parameters).';

    public function handle(WorkflowGroupResolver $resolver): int
    {
        if (!Schema::hasTable('samples')) {
            $this->error('Table "samples" not found.');
            return self::FAILURE;
        }

        if (!Schema::hasColumn('samples', 'workflow_group')) {
            $this->error('Column "samples.workflow_group" not found.');
            return self::FAILURE;
        }

        if (!Schema::hasTable('sample_requested_parameters')) {
            $this->error('Table "sample_requested_parameters" not found. Cannot backfill.');
            return self::FAILURE;
        }

        if (!Schema::hasColumn('sample_requested_parameters', 'sample_id') || !Schema::hasColumn('sample_requested_parameters', 'parameter_id')) {
            $this->error('Pivot "sample_requested_parameters" must have sample_id and parameter_id.');
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $limit = (int) ($this->option('limit') ?? 0);
        $chunk = max(50, (int) ($this->option('chunk') ?? 200));
        $onlyNull = (bool) $this->option('only-null');

        $this->info('Backfill workflow_group starting...');
        $this->line('Options: ' . json_encode([
            'dry_run' => $dryRun,
            'limit' => $limit,
            'chunk' => $chunk,
            'only_null' => $onlyNull,
        ]));

        $processed = 0;
        $updated = 0;
        $skippedNoParams = 0;
        $skippedUnresolvable = 0;
        $skippedAlreadyOk = 0;

        $base = Sample::query()->select(['sample_id', 'workflow_group']);

        if ($onlyNull) {
            $base->whereNull('workflow_group');
        }

        // Scan by sample_id ascending for stable chunking
        $base->orderBy('sample_id');

        $base->chunkById($chunk, function ($samples) use (
            $resolver,
            $dryRun,
            $limit,
            &$processed,
            &$updated,
            &$skippedNoParams,
            &$skippedUnresolvable,
            &$skippedAlreadyOk
        ) {
            $ids = $samples->pluck('sample_id')->map(fn($v) => (int) $v)->values()->all();
            if (!$ids) return;

            // Bulk load pivot sample_id -> [parameter_id...]
            $pivotRows = DB::table('sample_requested_parameters')
                ->whereIn('sample_id', $ids)
                ->get(['sample_id', 'parameter_id']);

            $paramMap = [];
            foreach ($pivotRows as $r) {
                $sid = (int) ($r->sample_id ?? 0);
                $pid = (int) ($r->parameter_id ?? 0);
                if ($sid <= 0 || $pid <= 0) continue;
                $paramMap[$sid] = $paramMap[$sid] ?? [];
                $paramMap[$sid][] = $pid;
            }

            foreach ($samples as $s) {
                if ($limit > 0 && $processed >= $limit) {
                    return false; // stop chunking
                }

                $processed++;
                $sampleId = (int) $s->sample_id;
                $old = $s->workflow_group;

                $pids = $paramMap[$sampleId] ?? [];
                $pids = array_values(array_unique(array_map('intval', $pids)));

                if (count($pids) === 0) {
                    $skippedNoParams++;
                    $this->line("SKIP sample_id={$sampleId} (no requested parameters)");
                    continue;
                }

                $resolved = $resolver->resolveFromParameterIds($pids);
                $newGroup = $resolved?->value ?? null;

                if (!$newGroup) {
                    $skippedUnresolvable++;
                    $this->line("SKIP sample_id={$sampleId} (cannot resolve group) pids=" . json_encode($pids));
                    continue;
                }

                if ($old === $newGroup) {
                    $skippedAlreadyOk++;
                    continue;
                }

                if ($dryRun) {
                    $updated++;
                    $this->info("DRY sample_id={$sampleId}: workflow_group {$old} -> {$newGroup}");
                    continue;
                }

                DB::table('samples')
                    ->where('sample_id', $sampleId)
                    ->update(['workflow_group' => $newGroup]);

                $updated++;
                $this->info("OK  sample_id={$sampleId}: workflow_group {$old} -> {$newGroup}");
            }
        }, 'sample_id');

        $this->newLine();
        $this->info('Backfill workflow_group finished.');
        $this->line('Summary: ' . json_encode([
            'processed' => $processed,
            'updated' => $updated,
            'skipped_no_params' => $skippedNoParams,
            'skipped_unresolvable' => $skippedUnresolvable,
            'skipped_already_ok' => $skippedAlreadyOk,
            'dry_run' => $dryRun,
        ]));

        return self::SUCCESS;
    }
}
