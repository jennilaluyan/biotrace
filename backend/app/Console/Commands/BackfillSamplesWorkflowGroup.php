<?php

namespace App\Console\Commands;

use App\Models\Sample;
use App\Services\WorkflowGroupResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BackfillSamplesWorkflowGroup extends Command
{
    protected $signature = 'samples:backfill-workflow-group {--dry-run} {--limit=0}';
    protected $description = 'Backfill samples.workflow_group based on existing parameter data (legacy-safe).';

    public function __construct(private readonly WorkflowGroupResolver $resolver)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        if (!Schema::hasColumn('samples', 'workflow_group')) {
            $this->error('Column samples.workflow_group not found. Did you persist workflow group in ToDo 9?');
            return self::FAILURE;
        }

        $dry = (bool) $this->option('dry-run');
        $limit = (int) $this->option('limit');

        $q = Sample::query()
            ->where(function ($qq) {
                $qq->whereNull('workflow_group')->orWhere('workflow_group', '=', '');
            })
            ->orderBy('sample_id');

        if ($limit > 0) $q->limit($limit);

        $count = 0;

        $q->chunkById(200, function ($samples) use ($dry, &$count) {
            foreach ($samples as $sample) {
                $paramIds = $this->deriveParameterIds($sample->sample_id);

                $group = $this->resolver->resolveFromParameterIds($paramIds);
                if (!$group) continue;

                $count++;

                if ($dry) {
                    $this->line("DRY sample_id={$sample->sample_id} -> {$group->value}");
                    continue;
                }

                $sample->workflow_group = $group->value;
                $sample->save();
            }
        }, 'sample_id');

        $this->info("Done. Updated {$count} samples.");
        return self::SUCCESS;
    }

    /**
     * Derive parameter IDs from DB (same idea as TestingBoardService fallback).
     *
     * @return array<int,int|string|null>
     */
    private function deriveParameterIds(int $sampleId): array
    {
        $out = [];

        // sample_tests
        if (Schema::hasTable('sample_tests') && Schema::hasColumn('sample_tests', 'sample_id')) {
            $rows = DB::table('sample_tests')->where('sample_id', $sampleId)->get();
            foreach ($rows as $r) {
                if (property_exists($r, 'parameter_id') && $r->parameter_id !== null) $out[] = $r->parameter_id;

                foreach (['parameter_ids', 'parameters'] as $jsonField) {
                    if (!property_exists($r, $jsonField)) continue;
                    $val = $r->{$jsonField};
                    if (!$val) continue;

                    if (is_string($val)) {
                        $decoded = json_decode($val, true);
                        if (json_last_error() === JSON_ERROR_NONE) $val = $decoded;
                    }
                    if (!is_array($val)) continue;

                    foreach ($val as $item) {
                        if (is_int($item) || is_string($item)) $out[] = $item;
                        if (is_array($item) && array_key_exists('parameter_id', $item)) $out[] = $item['parameter_id'];
                    }
                }
            }
        }

        // letter_of_order_items.parameters
        if (Schema::hasTable('letter_of_order_items') && Schema::hasColumn('letter_of_order_items', 'sample_id') && Schema::hasColumn('letter_of_order_items', 'parameters')) {
            $items = DB::table('letter_of_order_items')->where('sample_id', $sampleId)->get(['parameters']);
            foreach ($items as $it) {
                $val = $it->parameters ?? null;
                if (!$val) continue;

                if (is_string($val)) {
                    $decoded = json_decode($val, true);
                    if (json_last_error() === JSON_ERROR_NONE) $val = $decoded;
                }
                if (!is_array($val)) continue;

                foreach ($val as $p) {
                    if (is_int($p) || is_string($p)) $out[] = $p;
                    if (is_array($p) && array_key_exists('parameter_id', $p)) $out[] = $p['parameter_id'];
                }
            }
        }

        return $out;
    }
}
