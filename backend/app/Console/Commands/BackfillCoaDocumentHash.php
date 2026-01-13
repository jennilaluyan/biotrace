<?php

namespace App\Console\Commands;

use App\Models\Report;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class BackfillCoaDocumentHash extends Command
{
    protected $signature = 'coa:backfill-hash {--force : Recalculate even if hash exists}';

    protected $description = 'Backfill document_hash for locked COA reports';

    public function handle(): int
    {
        $this->info('Starting COA document hash backfill...');

        $reports = Report::query()
            ->where('is_locked', true)
            ->whereNotNull('pdf_url')
            ->when(!$this->option('force'), function ($q) {
                $q->whereNull('document_hash');
            })
            ->get();

        if ($reports->isEmpty()) {
            $this->info('No reports need backfill.');
            return Command::SUCCESS;
        }

        $disk = config('filesystems.default');
        $count = 0;

        foreach ($reports as $report) {
            if (!Storage::disk($disk)->exists($report->pdf_url)) {
                $this->warn("PDF missing for report_id={$report->report_id}");
                continue;
            }

            $binary = Storage::disk($disk)->get($report->pdf_url);
            $hash = hash('sha256', $binary);

            $report->document_hash = $hash;
            $report->save();

            $this->line("✔ report_id={$report->report_id} hash={$hash}");
            $count++;
        }

        $this->info("Backfill completed. {$count} report(s) updated.");

        return Command::SUCCESS;
    }
}
