<?php

namespace App\Console\Commands;

use App\Models\Report;
use App\Services\FileStoreService;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class DocsBackfillPdfsToDb extends Command
{
    protected $signature = 'docs:backfill-pdfs-to-db
        {--disk= : Filesystem disk name untuk baca PDF legacy (default: filesystems.default)}
        {--limit=0 : Maks report yang diproses (0 = semua)}
        {--from=0 : Mulai dari report_id (inclusive)}
        {--actor=0 : staff_id untuk created_by di files (0 = auto pilih staff_id terkecil)}
        {--dry-run : Tidak menulis apa pun, hanya print apa yang akan dilakukan}
        {--force : Proses juga report yang sudah punya pdf_file_id (overwrite)}
        {--deep-search : Kalau path tidak ketemu, cari berdasarkan nama file di folder-folder umum (lebih berat)}';

    protected $description = 'Backfill legacy report PDFs dari Storage ke DB files, lalu set reports.pdf_file_id (transisi aman dari pdf_url).';

    public function handle(FileStoreService $files): int
    {
        // Guard rails (biar ga meledak di environment yang schema-nya beda)
        if (!Schema::hasTable('reports')) {
            $this->error('Table "reports" not found.');
            return Command::FAILURE;
        }
        if (!Schema::hasTable('files')) {
            $this->error('Table "files" not found. Pastikan migration Step 2 sudah jalan.');
            return Command::FAILURE;
        }
        if (!Schema::hasColumn('reports', 'pdf_url')) {
            $this->error('Column "reports.pdf_url" not found.');
            return Command::FAILURE;
        }
        if (!Schema::hasColumn('reports', 'pdf_file_id')) {
            $this->error('Column "reports.pdf_file_id" not found. Pastikan migration add_pdf_file_id_to_reports_table sudah jalan.');
            return Command::FAILURE;
        }

        $disk = (string) ($this->option('disk') ?: config('filesystems.default', 'local'));
        $limit = max(0, (int) $this->option('limit'));
        $fromId = max(0, (int) $this->option('from'));
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $deepSearch = (bool) $this->option('deep-search');

        $actorId = $this->resolveActorId((int) $this->option('actor'));

        $this->info(sprintf(
            'docs:backfill-pdfs-to-db | disk=%s | actor=%d | from=%d | limit=%s | dryRun=%s | force=%s | deepSearch=%s',
            $disk,
            $actorId,
            $fromId,
            $limit > 0 ? (string) $limit : '∞',
            $dryRun ? 'yes' : 'no',
            $force ? 'yes' : 'no',
            $deepSearch ? 'yes' : 'no',
        ));

        $disks = (array) config('filesystems.disks', []);
        if (!array_key_exists($disk, $disks)) {
            $this->warn("Disk '{$disk}' tidak terdaftar di config(filesystems.disks). Tetap coba jalan, tapi kemungkinan gagal.");
        }

        $q = Report::query()
            ->whereNotNull('pdf_url')
            ->where('pdf_url', '!=', '')
            ->when(!$force, fn($qq) => $qq->whereNull('pdf_file_id'))
            ->when($fromId > 0, fn($qq) => $qq->where('report_id', '>=', $fromId))
            ->orderBy('report_id', 'asc');

        $processed = 0;
        $updated = 0;
        $missing = 0;
        $skipped = 0;
        $errors = 0;

        $q->chunkById(50, function ($chunk) use (
            $files,
            $disk,
            $limit,
            $dryRun,
            $force,
            $deepSearch,
            $actorId,
            &$processed,
            &$updated,
            &$missing,
            &$skipped,
            &$errors
        ) {
            foreach ($chunk as $report) {
                if ($limit > 0 && $processed >= $limit) {
                    return false; // stop chunking
                }

                $processed++;

                $rid = (int) ($report->report_id ?? 0);
                $raw = trim((string) ($report->pdf_url ?? ''));

                if ($rid <= 0 || $raw === '') {
                    $skipped++;
                    continue;
                }

                // kalau ga force, harusnya sudah tersaring, tapi tetep aman
                if (!$force && !empty($report->pdf_file_id)) {
                    $skipped++;
                    continue;
                }

                $foundPath = $this->findLegacyPdfPath($disk, $raw, $deepSearch);
                if (!$foundPath) {
                    $this->warn("✖ report_id={$rid} PDF tidak ketemu untuk pdf_url='{$raw}'");
                    $missing++;
                    continue;
                }

                try {
                    $bytes = Storage::disk($disk)->get($foundPath);
                    if ($bytes === '' || $bytes === null) {
                        $this->warn("✖ report_id={$rid} file kosong/invalid: {$foundPath}");
                        $missing++;
                        continue;
                    }

                    $origName = $this->buildOriginalName($report);

                    if ($dryRun) {
                        $this->line("• report_id={$rid} FOUND {$foundPath} (" . strlen($bytes) . " bytes) => would store as '{$origName}'");
                        continue;
                    }

                    $fileId = $files->storeBytes(
                        $bytes,
                        $origName,
                        'application/pdf',
                        'pdf',
                        $actorId,
                        true // dedupe by sha256+size (sesuai FileStoreService)
                    );

                    $report->pdf_file_id = $fileId;
                    $report->save();

                    $this->line("✔ report_id={$rid} => pdf_file_id={$fileId} (source='{$foundPath}')");
                    $updated++;
                } catch (QueryException $e) {
                    $errors++;
                    $msg = $e->errorInfo[2] ?? $e->getMessage();
                    $this->error("‼ report_id={$rid} DB ERROR: {$msg}");
                    $this->line("SQL: " . $e->getSql());

                    // jangan dump bindings raw (bisa mengandung BLOB PDF)
                    $sizes = array_map(function ($b) {
                        if (is_string($b)) return 'string:' . strlen($b);
                        if (is_null($b)) return 'null';
                        return gettype($b);
                    }, $e->getBindings());
                    $this->line("Bindings: " . json_encode($sizes));
                } catch (\Throwable $e) {
                    $errors++;
                    $this->error("‼ report_id={$rid} ERROR: " . $e->getMessage());
                }
            }

            return true;
        }, 'report_id');

        $this->info("Done. processed={$processed}, updated={$updated}, missing={$missing}, skipped={$skipped}, errors={$errors}");

        return Command::SUCCESS;
    }

    private function resolveActorId(int $actorOpt): int
    {
        // Kalau user kasih actor dan valid, pakai itu
        if ($actorOpt > 0 && $this->staffExists($actorOpt)) {
            return $actorOpt;
        }

        // Kalau ada table staffs, ambil staff_id terkecil biar FK aman
        try {
            if (Schema::hasTable('staffs')) {
                $min = (int) (DB::table('staffs')->min('staff_id') ?? 0);
                if ($min > 0) return $min;
            }
        } catch (\Throwable) {
            // ignore
        }

        // fallback terakhir (kalau tidak ada FK staff)
        return 0;
    }

    private function staffExists(int $staffId): bool
    {
        try {
            if (!Schema::hasTable('staffs')) return true; // ga ada FK, aman
            return DB::table('staffs')->where('staff_id', $staffId)->exists();
        } catch (\Throwable) {
            return false;
        }
    }

    private function buildOriginalName(Report $report): string
    {
        $no = trim((string) ($report->report_no ?? ''));
        $rid = (int) ($report->report_id ?? 0);

        $base = $no !== '' ? $no : ("COA_" . $rid);

        // sanitize filename
        $base = preg_replace('/[^\pL\pN\-\._]+/u', '_', $base) ?: ('COA_' . $rid);
        $base = trim($base, "._- \t\n\r\0\x0B");

        if ($base === '') $base = 'COA_' . $rid;

        // ensure .pdf
        if (!str_ends_with(strtolower($base), '.pdf')) {
            $base .= '.pdf';
        }

        return $base;
    }

    private function findLegacyPdfPath(string $disk, string $raw, bool $deepSearch): ?string
    {
        $diskObj = Storage::disk($disk);

        foreach ($this->buildCandidates($raw) as $cand) {
            try {
                if ($cand !== '' && $diskObj->exists($cand)) {
                    return $cand;
                }
            } catch (\Throwable) {
                // ignore
            }
        }

        if (!$deepSearch) return null;

        // Deep search by basename (lebih berat)
        $normalized = str_replace('\\', '/', trim($raw));
        $filename = basename($normalized);
        if ($filename === '' || $filename === '.' || $filename === '/') return null;

        $roots = [
            'private/reports',
            'private/reports/coa',
            'private/letters',
            'reports',
            'letters',
        ];

        foreach ($roots as $root) {
            try {
                $all = $diskObj->allFiles($root);
                foreach ($all as $p) {
                    if (basename((string) $p) === $filename) {
                        return (string) $p;
                    }
                }
            } catch (\Throwable) {
                // ignore root errors
            }
        }

        return null;
    }

    private function buildCandidates(string $raw): array
    {
        $raw = trim($raw);
        if ($raw === '') return [];

        $raw = str_replace('\\', '/', $raw);

        // kalau URL, ambil path-nya
        if (preg_match('/^https?:\/\//i', $raw)) {
            $p = parse_url($raw, PHP_URL_PATH);
            if (is_string($p) && $p !== '') $raw = $p;
        }

        $rel = ltrim($raw, '/');

        $candidates = [];

        // jika mengandung /storage/, ambil setelah itu
        if (strpos($raw, '/storage/') !== false) {
            $after = substr($raw, strpos($raw, '/storage/') + strlen('/storage/'));
            if (is_string($after) && $after !== '') $candidates[] = ltrim($after, '/');
        }

        if ($rel !== '') $candidates[] = $rel;

        // variasi umum
        $candidates[] = preg_replace('#^storage/#', '', $rel);
        $candidates[] = preg_replace('#^public/#', '', $rel);

        $candidates = array_values(array_unique(array_filter($candidates, fn($v) => is_string($v) && trim($v) !== '')));

        // coba juga dengan prefix private/
        $withPrivate = [];
        foreach ($candidates as $c) {
            $c = ltrim((string) $c, '/');
            if ($c === '') continue;
            $withPrivate[] = $c;
            if (!str_starts_with($c, 'private/')) $withPrivate[] = 'private/' . $c;
        }

        return array_values(array_unique($withPrivate));
    }
}
