<?php

namespace App\Console\Commands;

use App\Models\ConsumableCatalogItem;
use App\Support\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ImportConsumablesCatalog extends Command
{
    protected $signature = 'catalog:import-consumables
        {file : Path to the Excel file (.xlsx)}
        {--truncate : Clear consumables_catalog before importing}
        {--dry-run : Parse and report only (no DB write)}
        {--staff= : Staff ID for audit logging (required unless --dry-run)}
    ';

    protected $description = 'Import consumables/reagents catalog from Excel (BHP + REAGEN, including expired sheets).';

    public function handle(): int
    {
        $file = (string) $this->argument('file');
        $truncate = (bool) $this->option('truncate');
        $dryRun = (bool) $this->option('dry-run');
        $staffId = $this->option('staff') !== null ? (int) $this->option('staff') : null;

        if (!is_file($file)) {
            $this->error("File not found: {$file}");
            return self::FAILURE;
        }

        if (!$dryRun && !$staffId) {
            $this->error("Missing --staff=<id>. Audit-first rule: staff ID is required for import writes.");
            return self::FAILURE;
        }

        $this->info("Loading Excel: {$file}");

        $spreadsheet = IOFactory::load($file);

        // Sheet names in your workbook (verified from the uploaded Excel)
        $targets = [
            '1.BHP',
            'BHP EXPIRED',
            '2.REAGEN',
            'REAGEN EXPIRED',
        ];

        $summary = [
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'errors'  => 0,
        ];

        $sourceFile = basename($file);

        if ($truncate && !$dryRun) {
            $this->warn("Truncating table consumables_catalog ...");
            DB::table('consumables_catalog')->truncate();
        }

        foreach ($targets as $sheetName) {
            $sheet = $spreadsheet->getSheetByName($sheetName);
            if (!$sheet) {
                $this->warn("Sheet not found, skipping: {$sheetName}");
                continue;
            }

            $itemType = str_contains($sheetName, 'BHP') ? 'bhp' : 'reagen';
            $isActive = !str_contains($sheetName, 'EXPIRED');

            $this->line("→ Parsing sheet: {$sheetName} (type={$itemType}, active=" . ($isActive ? 'true' : 'false') . ")");

            $rows = $sheet->toArray(null, true, true, true); // keys A,B,C...

            // 1) Find header row containing "No." and "NAMA"
            $headerRowNum = $this->findHeaderRow($rows);
            if (!$headerRowNum) {
                $this->warn("  Could not detect header row in sheet {$sheetName}. Skipping.");
                continue;
            }

            // 2) Find "Satuan" column (usually in a subheader row under STOK)
            $unitCol = $this->findUnitColumn($rows, $headerRowNum);

            // 3) Find first data row (first row where No is numeric and name not empty)
            $dataStartRow = $this->findDataStartRow($rows, $headerRowNum);
            if (!$dataStartRow) {
                $this->warn("  Could not detect data start row in sheet {$sheetName}. Skipping.");
                continue;
            }

            $emptyStreak = 0;

            for ($r = $dataStartRow; $r <= count($rows); $r++) {
                $row = $rows[$r] ?? null;
                if (!$row) continue;

                $no = $this->normalizeScalar($row['A'] ?? null);
                $name = $this->normalizeString($row['B'] ?? null);
                $spec = $this->normalizeString($row['C'] ?? null);
                $expiry = $this->normalizeString($row['D'] ?? null);
                $unitText = $unitCol ? $this->normalizeString($row[$unitCol] ?? null) : null;

                // Stop condition: long streak of empty rows
                if (!$name && !$no) {
                    $emptyStreak++;
                    if ($emptyStreak >= 15) break;
                    continue;
                }
                $emptyStreak = 0;

                // Skip junk rows
                if (!$name) {
                    $summary['skipped']++;
                    continue;
                }

                // Clean spec: sometimes numeric like 2310182.0
                $spec = $spec !== '' ? $spec : null;

                // For now we keep expiry in specification if needed later; schema step 4.1 doesn’t store expiry.
                // (Expired sheet already indicates inactive; we don't need per-row expiry for catalog master)
                // But we keep it inside new_values metadata for audit.

                $payload = [
                    'item_type' => $itemType,
                    'name' => $name,
                    'specification' => $spec,
                    'default_unit_id' => null,            // best-effort mapping can be added later
                    'default_unit_text' => $unitText,
                    'category' => null,
                    'is_active' => $isActive,
                    'source_file' => $sourceFile,
                    'source_sheet' => $sheetName,
                    'source_row' => $r,
                ];

                if ($dryRun) {
                    $this->line("  [DRY] {$itemType} | {$name}" . ($spec ? " | {$spec}" : "") . ($unitText ? " | unit={$unitText}" : ""));
                    continue;
                }

                try {
                    DB::transaction(function () use ($payload, $staffId, $expiry, &$summary) {
                        $existing = ConsumableCatalogItem::query()
                            ->where('item_type', $payload['item_type'])
                            ->where('name', $payload['name'])
                            ->where(function ($q) use ($payload) {
                                if ($payload['specification'] === null) {
                                    $q->whereNull('specification');
                                } else {
                                    $q->where('specification', $payload['specification']);
                                }
                            })
                            ->first();

                        if (!$existing) {
                            $created = ConsumableCatalogItem::create($payload);
                            $summary['created']++;

                            AuditLogger::write(
                                action: 'CATALOG_ITEM_IMPORTED',
                                staffId: $staffId,
                                entityName: 'consumables_catalog',
                                entityId: (int) $created->catalog_id,
                                oldValues: null,
                                newValues: [
                                    'mode' => 'created',
                                    'item_type' => $payload['item_type'],
                                    'name' => $payload['name'],
                                    'specification' => $payload['specification'],
                                    'default_unit_text' => $payload['default_unit_text'],
                                    'is_active' => $payload['is_active'],
                                    'source' => [
                                        'file' => $payload['source_file'],
                                        'sheet' => $payload['source_sheet'],
                                        'row' => $payload['source_row'],
                                        'expiry_raw' => $expiry,
                                    ],
                                ]
                            );

                            return;
                        }

                        $old = $existing->only([
                            'item_type',
                            'name',
                            'specification',
                            'default_unit_id',
                            'default_unit_text',
                            'category',
                            'is_active',
                            'source_file',
                            'source_sheet',
                            'source_row',
                        ]);

                        $existing->fill($payload);
                        $dirty = $existing->getDirty();

                        if (empty($dirty)) {
                            $summary['skipped']++;
                            return;
                        }

                        $existing->save();
                        $summary['updated']++;

                        AuditLogger::write(
                            action: 'CATALOG_ITEM_IMPORTED',
                            staffId: $staffId,
                            entityName: 'consumables_catalog',
                            entityId: (int) $existing->catalog_id,
                            oldValues: $old,
                            newValues: [
                                'mode' => 'updated',
                                'changed' => array_keys($dirty),
                                'source' => [
                                    'file' => $payload['source_file'],
                                    'sheet' => $payload['source_sheet'],
                                    'row' => $payload['source_row'],
                                    'expiry_raw' => $expiry,
                                ],
                            ]
                        );
                    });
                } catch (\Throwable $e) {
                    $summary['errors']++;
                    $this->error("  Error at row {$r} ({$sheetName}): " . $e->getMessage());
                }
            }
        }

        if ($dryRun) {
            $this->info("DRY RUN completed. No DB writes.");
            return self::SUCCESS;
        }

        // One summary audit event (entityId=0 used as "catalog scope", audit_logs entity_id is not FK)
        AuditLogger::write(
            action: 'CATALOG_IMPORT_SUMMARY',
            staffId: $staffId,
            entityName: 'consumables_catalog',
            entityId: 0,
            oldValues: null,
            newValues: [
                'file' => basename($file),
                'summary' => $summary,
            ]
        );

        $this->info("Import completed: created={$summary['created']}, updated={$summary['updated']}, skipped={$summary['skipped']}, errors={$summary['errors']}");
        return self::SUCCESS;
    }

    private function findHeaderRow(array $rows): ?int
    {
        foreach ($rows as $r => $row) {
            $a = $this->normalizeString($row['A'] ?? null);
            $b = $this->normalizeString($row['B'] ?? null);

            if ($a === 'No.' && str_contains(mb_strtoupper($b), 'NAMA')) {
                return (int) $r;
            }
        }
        return null;
    }

    private function findUnitColumn(array $rows, int $headerRowNum): ?string
    {
        // Scan a few rows after the header for the "Satuan" cell.
        for ($r = $headerRowNum; $r <= $headerRowNum + 6; $r++) {
            $row = $rows[$r] ?? null;
            if (!$row) continue;

            foreach ($row as $col => $val) {
                if ($this->normalizeString($val) === 'Satuan') {
                    return $col; // e.g. 'G'
                }
            }
        }
        return null;
    }

    private function findDataStartRow(array $rows, int $headerRowNum): ?int
    {
        for ($r = $headerRowNum + 1; $r <= $headerRowNum + 15; $r++) {
            $row = $rows[$r] ?? null;
            if (!$row) continue;

            $no = $row['A'] ?? null;
            $name = $this->normalizeString($row['B'] ?? null);

            if ($name && is_numeric($no)) {
                return (int) $r;
            }
        }

        // fallback: broader search
        foreach ($rows as $r => $row) {
            if ($r <= $headerRowNum) continue;
            $no = $row['A'] ?? null;
            $name = $this->normalizeString($row['B'] ?? null);
            if ($name && is_numeric($no)) return (int) $r;
        }

        return null;
    }

    private function normalizeString(mixed $v): ?string
    {
        if ($v === null) return null;
        if (is_string($v)) {
            $s = trim($v);
            return $s === '' ? null : $s;
        }
        if (is_numeric($v)) {
            // Remove trailing .0 if present
            $s = (string) $v;
            $s = preg_replace('/\.0$/', '', $s);
            return $s === '' ? null : $s;
        }
        return trim((string) $v);
    }

    private function normalizeScalar(mixed $v): mixed
    {
        if ($v === null) return null;
        if (is_string($v)) {
            $s = trim($v);
            return $s === '' ? null : $s;
        }
        return $v;
    }
}