<?php

namespace App\Console\Commands;

use App\Support\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ImportEquipmentCatalog extends Command
{
    protected $signature = 'catalog:import-equipment
        {file : Path to the Excel file (.xlsx)}
        {--truncate : Clear equipment_catalog before importing}
        {--dry-run : Parse and report only (no DB write)}
        {--staff= : Staff ID for audit logging (required unless --dry-run)}
        {--sheet=* : Restrict import to specific sheet(s). Repeatable option. Example: --sheet="INVENTARIS PERALATAN UNSRAT "}
    ';

    protected $description = 'Import equipment catalog from Excel inventory workbook (multi-sheet, header auto-detect).';

    public function handle(): int
    {
        $file = (string) $this->argument('file');
        $truncate = (bool) $this->option('truncate');
        $dryRun = (bool) $this->option('dry-run');
        $staffId = $this->option('staff') !== null ? (int) $this->option('staff') : null;
        $sheetsOpt = (array) ($this->option('sheet') ?? []);

        if (!is_file($file)) {
            $this->error("File not found: {$file}");
            return self::FAILURE;
        }

        // Audit-first rule (same principle as ImportConsumablesCatalog)
        if (!$dryRun && !$staffId) {
            $this->error("Missing --staff=<id>. Audit-first rule: staff ID is required for import writes.");
            return self::FAILURE;
        }

        if (!Schema::hasTable('equipment_catalog')) {
            $this->error("Table equipment_catalog not found. Pastikan step 5.1 migration sudah jalan.");
            return self::FAILURE;
        }

        // Column safety: only write columns that exist in DB
        $tableCols = Schema::getColumnListing('equipment_catalog');

        // Pick the best guess column names for identity fields (schema may vary)
        $colCode = $this->firstExistingColumn($tableCols, ['code', 'equipment_code', 'kode_alat']);
        $colName = $this->firstExistingColumn($tableCols, ['name', 'equipment_name', 'nama_peralatan', 'nama']);
        $pkCol = $this->firstExistingColumn($tableCols, ['equipment_id', 'id', 'catalog_id']);

        if (!$colCode || !$colName) {
            $this->error("equipment_catalog schema mismatch: cannot find code/name column. Expected one of: code/equipment_code/kode_alat AND name/equipment_name/...");
            return self::FAILURE;
        }

        $this->info("Loading Excel: {$file}");
        $spreadsheet = IOFactory::load($file);

        $allSheetNames = $spreadsheet->getSheetNames();

        // Determine target sheets
        $targets = [];
        if (!empty($sheetsOpt)) {
            $targets = $sheetsOpt;
        } else {
            foreach ($allSheetNames as $sn) {
                $snUpper = strtoupper((string) $sn);
                if ($snUpper === 'MASTER') continue;
                if (str_contains($snUpper, 'INVENTARIS')) {
                    $targets[] = $sn;
                }
            }
            // Fallback: if none matched, import everything except MASTER
            if (empty($targets)) {
                $targets = array_values(array_filter($allSheetNames, fn($sn) => strtoupper((string) $sn) !== 'MASTER'));
            }
        }

        $summary = [
            'created' => 0,
            'updated' => 0,
            'skipped' => 0,
            'errors' => 0,
            'sheets' => [],
        ];

        $sourceFile = basename($file);

        if ($truncate && !$dryRun) {
            $this->warn("Truncating table equipment_catalog ...");
            DB::table('equipment_catalog')->truncate();
        }

        foreach ($targets as $sheetName) {
            $sheet = $spreadsheet->getSheetByName($sheetName);
            if (!$sheet) {
                $this->warn("Sheet not found, skipping: {$sheetName}");
                continue;
            }

            $this->line("→ Parsing sheet: {$sheetName}");
            $rows = $sheet->toArray(null, true, true, true); // keys A,B,C...

            $headerRowNum = $this->findHeaderRow($rows);
            if (!$headerRowNum) {
                $this->warn("  Could not detect header row (needs 'KODE ALAT'). Skipping sheet: {$sheetName}");
                continue;
            }

            $colMap = $this->buildHeaderMap($rows, $headerRowNum);

            $dataStartRow = $this->findDataStartRow($rows, $headerRowNum, $colMap);
            if (!$dataStartRow) {
                $this->warn("  Could not detect data start row. Skipping sheet: {$sheetName}");
                continue;
            }

            $sheetStats = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => 0];

            $emptyStreak = 0;
            for ($r = $dataStartRow; $r <= count($rows); $r++) {
                $row = $rows[$r] ?? null;
                if (!$row) continue;

                // Extract by header mapping
                $rawNo = $this->normalizeScalar($row[$colMap['NO'] ?? 'A'] ?? null);
                $rawName = $this->normalizeString($row[$colMap['NAMA_PERALATAN'] ?? null] ?? null);
                $rawCode = $this->normalizeString($row[$colMap['KODE_ALAT'] ?? null] ?? null);

                // Stop condition: long streak of empty rows
                if (!$rawName && !$rawCode && !$rawNo) {
                    $emptyStreak++;
                    if ($emptyStreak >= 15) break;
                    continue;
                }
                $emptyStreak = 0;

                $code = $this->normalizeEquipmentCode($rawCode);
                $name = $rawName !== '' ? $rawName : null;

                // Skip junk rows
                if (!$code || !$name) {
                    $summary['skipped']++;
                    $sheetStats['skipped']++;
                    continue;
                }

                // Other optional fields from Excel (best-effort)
                $brand = $this->normalizeString($row[$colMap['MEREK'] ?? null] ?? null);
                $model = $this->normalizeString($row[$colMap['TIPE_MODEL'] ?? null] ?? null);
                $sn = $this->normalizeString($row[$colMap['SN'] ?? null] ?? null);
                $distributor = $this->normalizeString($row[$colMap['DISTRIBUTOR'] ?? null] ?? null);
                $condition = $this->normalizeString($row[$colMap['KONDISI'] ?? null] ?? null);
                $physical = $this->normalizeString($row[$colMap['KONDISI_FISIK'] ?? null] ?? null);
                $location = $this->normalizeString($row[$colMap['LOKASI'] ?? null] ?? null);
                $status = $this->normalizeString($row[$colMap['STATUS'] ?? null] ?? null);

                // Prepare payload with schema-safe filtering
                $payloadAll = [
                    $colCode => $code,
                    $colName => $name,

                    // Common optional columns (written only if exist)
                    'brand' => $brand !== '' ? $brand : null,
                    'manufacturer' => $brand !== '' ? $brand : null, // alias (some schemas use manufacturer)
                    'model' => $model !== '' ? $model : null,
                    'serial_number' => $sn !== '' ? $sn : null,
                    'distributor' => $distributor !== '' ? $distributor : null,
                    'condition' => $condition !== '' ? $condition : null,
                    'physical_condition' => $physical !== '' ? $physical : null,
                    'location' => $location !== '' ? $location : null,
                    'status' => $status !== '' ? $status : null,

                    // Traceability (align with your consumables pattern)
                    'is_active' => true,
                    'source_file' => $sourceFile,
                    'source_sheet' => (string) $sheetName,
                    'source_row' => $r,
                ];

                $payload = $this->filterPayloadByExistingColumns($payloadAll, $tableCols);

                if ($dryRun) {
                    $this->line("  [DRY] {$code} | {$name}" . ($location ? " | {$location}" : ""));
                    continue;
                }

                try {
                    DB::transaction(function () use (
                        $payload,
                        $staffId,
                        $pkCol,
                        $colCode,
                        $code,
                        &$summary,
                        &$sheetStats
                    ) {
                        $existing = DB::table('equipment_catalog')->where($colCode, $code)->first();

                        if (!$existing) {
                            $newId = DB::table('equipment_catalog')->insertGetId($payload);
                            $summary['created']++;
                            $sheetStats['created']++;

                            AuditLogger::write(
                                action: 'EQUIPMENT_CATALOG_IMPORTED',
                                staffId: $staffId,
                                entityName: 'equipment_catalog',
                                entityId: (int) $newId,
                                oldValues: null,
                                newValues: [
                                    'mode' => 'created',
                                    'code' => $payload[$colCode] ?? $code,
                                    'name' => $payload['name'] ?? ($payload['equipment_name'] ?? null),
                                    'source' => [
                                        'file' => $payload['source_file'] ?? null,
                                        'sheet' => $payload['source_sheet'] ?? null,
                                        'row' => $payload['source_row'] ?? null,
                                    ],
                                ]
                            );
                            return;
                        }

                        // Dirty check (only compare payload keys)
                        $old = [];
                        foreach (array_keys($payload) as $k) {
                            $old[$k] = $existing->{$k} ?? null;
                        }

                        $dirtyKeys = [];
                        foreach ($payload as $k => $v) {
                            $cur = $existing->{$k} ?? null;
                            if ((string) $cur !== (string) $v) {
                                $dirtyKeys[] = $k;
                            }
                        }

                        if (empty($dirtyKeys)) {
                            $summary['skipped']++;
                            $sheetStats['skipped']++;
                            return;
                        }

                        DB::table('equipment_catalog')
                            ->where($colCode, $code)
                            ->update($payload);

                        $summary['updated']++;
                        $sheetStats['updated']++;

                        $entityId = $pkCol ? (int) ($existing->{$pkCol} ?? 0) : 0;

                        AuditLogger::write(
                            action: 'EQUIPMENT_CATALOG_IMPORTED',
                            staffId: $staffId,
                            entityName: 'equipment_catalog',
                            entityId: $entityId,
                            oldValues: $old,
                            newValues: [
                                'mode' => 'updated',
                                'changed' => $dirtyKeys,
                                'source' => [
                                    'file' => $payload['source_file'] ?? null,
                                    'sheet' => $payload['source_sheet'] ?? null,
                                    'row' => $payload['source_row'] ?? null,
                                ],
                            ]
                        );
                    });
                } catch (\Throwable $e) {
                    $summary['errors']++;
                    $sheetStats['errors']++;
                    $this->error("  Error at row {$r} ({$sheetName}): " . $e->getMessage());
                }
            }

            $summary['sheets'][(string) $sheetName] = $sheetStats;
        }

        if ($dryRun) {
            $this->info("DRY RUN completed. No DB writes.");
            return self::SUCCESS;
        }

        // Summary audit event (entityId=0 as catalog scope, same pattern as consumables importer)
        AuditLogger::write(
            action: 'EQUIPMENT_CATALOG_IMPORT_SUMMARY',
            staffId: $staffId,
            entityName: 'equipment_catalog',
            entityId: 0,
            oldValues: null,
            newValues: [
                'file' => $sourceFile,
                'summary' => $summary,
            ]
        );

        $this->info("Import completed: created={$summary['created']}, updated={$summary['updated']}, skipped={$summary['skipped']}, errors={$summary['errors']}");
        return self::SUCCESS;
    }

    private function filterPayloadByExistingColumns(array $payload, array $existingCols): array
    {
        $set = array_flip($existingCols);
        $out = [];
        foreach ($payload as $k => $v) {
            if (isset($set[$k])) {
                $out[$k] = $v;
            }
        }
        return $out;
    }

    private function firstExistingColumn(array $existingCols, array $candidates): ?string
    {
        $set = array_flip($existingCols);
        foreach ($candidates as $c) {
            if (isset($set[$c])) return $c;
        }
        return null;
    }

    /**
     * Detect header row by searching for "KODE ALAT" (case-insensitive, punctuation-insensitive).
     */
    private function findHeaderRow(array $rows): ?int
    {
        foreach ($rows as $r => $row) {
            $hay = [];
            foreach ($row as $cell) {
                $hay[] = $this->normalizeHeader($cell);
            }
            $joined = implode('|', array_filter($hay));
            if (str_contains($joined, 'KODEALAT')) {
                return (int) $r;
            }
        }
        return null;
    }

    /**
     * Build mapping from normalized header name -> column letter.
     * We store a fixed internal key set so data extraction is stable.
     */
    private function buildHeaderMap(array $rows, int $headerRowNum): array
    {
        $row = $rows[$headerRowNum] ?? [];
        $map = [];

        foreach ($row as $col => $cell) {
            $h = $this->normalizeHeader($cell);
            if ($h === '') continue;

            // Core columns
            if ($h === 'NO' || $h === 'NOMOR') $map['NO'] = $col;
            if (str_contains($h, 'NAMAPERALATAN')) $map['NAMA_PERALATAN'] = $col;
            if ($h === 'MEREK' || str_contains($h, 'MERK')) $map['MEREK'] = $col;
            if (str_contains($h, 'TIPEMODEL') || str_contains($h, 'TYPEMODEL') || $h === 'MODEL') $map['TIPE_MODEL'] = $col;
            if ($h === 'SN' || str_contains($h, 'SERIAL')) $map['SN'] = $col;
            if (str_contains($h, 'DISTRIBUTOR')) $map['DISTRIBUTOR'] = $col;
            if ($h === 'KONDISI') $map['KONDISI'] = $col;
            if (str_contains($h, 'KONDISIFISIK')) $map['KONDISI_FISIK'] = $col;
            if ($h === 'LOKASI' || str_contains($h, 'LOCATION')) $map['LOKASI'] = $col;
            if ($h === 'STATUS') $map['STATUS'] = $col;
            if (str_contains($h, 'KODEALAT')) $map['KODE_ALAT'] = $col;
        }

        return $map;
    }

    private function findDataStartRow(array $rows, int $headerRowNum, array $colMap): ?int
    {
        $noCol = $colMap['NO'] ?? 'A';
        $nameCol = $colMap['NAMA_PERALATAN'] ?? null;
        $codeCol = $colMap['KODE_ALAT'] ?? null;

        for ($r = $headerRowNum + 1; $r <= count($rows); $r++) {
            $row = $rows[$r] ?? null;
            if (!$row) continue;

            $no = $this->normalizeScalar($row[$noCol] ?? null);
            $name = $nameCol ? $this->normalizeString($row[$nameCol] ?? null) : null;
            $code = $codeCol ? $this->normalizeString($row[$codeCol] ?? null) : null;

            $noIsNumber = is_numeric($no) && (string) $no !== '';
            if ($noIsNumber && ($name || $code)) {
                return (int) $r;
            }
        }

        return null;
    }

    private function normalizeHeader(mixed $v): string
    {
        $s = $this->normalizeString($v);
        if ($s === null) return '';
        $s = strtoupper($s);
        // remove punctuation/spaces
        $s = preg_replace('/[^A-Z0-9]+/', '', $s);
        return $s ?? '';
    }

    private function normalizeEquipmentCode(?string $code): ?string
    {
        if ($code === null) return null;
        $s = trim($code);
        if ($s === '') return null;
        // collapse whitespace
        $s = preg_replace('/\s+/', ' ', $s);
        // normalize "LBM - XXX" -> "LBM-XXX" (remove spaces around hyphen)
        $s = preg_replace('/\s*-\s*/', '-', $s);
        return $s ?: null;
    }

    private function normalizeString(mixed $v): ?string
    {
        if ($v === null) return null;
        if (is_string($v)) {
            $s = trim($v);
            return $s === '' ? null : $s;
        }
        if (is_numeric($v)) {
            // Remove trailing .0 if present (Excel numeric artifacts)
            $s = (string) $v;
            $s = preg_replace('/\.0$/', '', $s);
            $s = trim($s);
            return $s === '' ? null : $s;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
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
