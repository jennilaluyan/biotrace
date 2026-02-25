<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\RichText\RichText;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use RuntimeException;

class XlsxTemplateRenderService
{
    /**
     * Render XLSX template bytes with ${placeholders}.
     *
     * @param string $templateXlsxBytes
     * @param array<string, string|int|float|null> $vars  key => value (template uses ${key})
     * @param string|null $preferredSheetName  if provided, set as active and hide other sheets (keeps formulas working)
     */
    public function renderBytes(string $templateXlsxBytes, array $vars = [], ?string $preferredSheetName = null): string
    {
        $tmpDir = $this->makeTmpDir();
        $inPath = $tmpDir . DIRECTORY_SEPARATOR . 'template.xlsx';
        $outPath = $tmpDir . DIRECTORY_SEPARATOR . 'merged.xlsx';

        file_put_contents($inPath, $templateXlsxBytes);

        try {
            $spreadsheet = IOFactory::load($inPath);

            // normalize vars => placeholder map (${key} => value)
            $map = [];
            foreach ($vars as $k => $v) {
                $key = $this->sanitizeKey((string) $k);
                if ($key === '') continue;
                $map['${' . $key . '}'] = $v === null ? '' : (string) $v;
            }

            if ($preferredSheetName) {
                $wanted = trim((string) $preferredSheetName);

                // 1) exact match
                $sheet = $spreadsheet->getSheetByName($wanted);

                // 2) case-insensitive match (handles "LHU " vs "LHU")
                if (!$sheet) {
                    foreach ($spreadsheet->getAllSheets() as $ws) {
                        if (strcasecmp(trim($ws->getTitle()), $wanted) === 0) {
                            $sheet = $ws;
                            break;
                        }
                    }
                }

                if ($sheet) {
                    $activeTitle = $sheet->getTitle();
                    $spreadsheet->setActiveSheetIndex($spreadsheet->getIndex($sheet));

                    foreach ($spreadsheet->getAllSheets() as $ws) {
                        if ($ws->getTitle() !== $activeTitle) {
                            $ws->setSheetState(Worksheet::SHEETSTATE_VERYHIDDEN);
                        } else {
                            $ws->setSheetState(Worksheet::SHEETSTATE_VISIBLE);
                        }
                    }
                }
            }

            // replace placeholders on ALL sheets (so formulas referencing "DATA BASE" still work if user keeps that structure)
            foreach ($spreadsheet->getAllSheets() as $ws) {
                $this->replacePlaceholdersInWorksheet($ws, $map);
            }

            // save merged
            $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
            // keep formulas as-is (LibreOffice can recalc); we mainly replace visible text
            if (method_exists($writer, 'setPreCalculateFormulas')) {
                $writer->setPreCalculateFormulas(false);
            }
            $writer->save($outPath);

            $merged = file_get_contents($outPath);
            if ($merged === false) {
                throw new RuntimeException('Failed to read merged XLSX output.');
            }

            return $merged;
        } finally {
            $this->cleanupDir($tmpDir);
        }
    }

    private function replacePlaceholdersInWorksheet(Worksheet $ws, array $map): void
    {
        if (!$map) return;

        $highestRow = $ws->getHighestDataRow();
        $highestCol = Coordinate::columnIndexFromString($ws->getHighestDataColumn());

        for ($row = 1; $row <= $highestRow; $row++) {
            for ($col = 1; $col <= $highestCol; $col++) {
                $addr = Coordinate::stringFromColumnIndex($col) . $row;
                $cell = $ws->getCell($addr);
                $v = $cell->getValue();

                if ($v === null) continue;

                // If formula contains placeholders (rare but safe), convert to string after replacement
                if ($cell->isFormula()) {
                    $f = (string) $v;
                    if (strpos($f, '$') === false) continue;

                    $norm = $this->normalizePlaceholderTypos($f);
                    $new = strtr($norm, $map);

                    if ($new !== $f) {
                        $cell->setValueExplicit($new, DataType::TYPE_STRING);
                    }
                    continue;
                }

                if ($v instanceof RichText) {
                    $changed = false;

                    foreach ($v->getRichTextElements() as $el) {
                        if (!method_exists($el, 'getText') || !method_exists($el, 'setText')) continue;

                        $txt = (string) $el->getText();
                        if (strpos($txt, '$') === false) continue;

                        $norm = $this->normalizePlaceholderTypos($txt);
                        $new = strtr($norm, $map);

                        if ($new !== $txt) {
                            $el->setText($new);
                            $changed = true;
                        }
                    }

                    if ($changed) $cell->setValue($v);
                    continue;
                }

                if (!is_string($v) || trim($v) === '' || strpos($v, '$') === false) continue;

                $norm = $this->normalizePlaceholderTypos($v);
                $new = strtr($norm, $map);

                if ($new !== $v) {
                    $cell->setValueExplicit($new, DataType::TYPE_STRING);
                }
            }
        }
    }

    private function sanitizeKey(string $key): string
    {
        $key = preg_replace('/[^A-Za-z0-9_]/', '_', $key) ?: '';
        return trim($key, '_');
    }

    private function normalizePlaceholderTypos(string $s): string
    {
        // $result} => ${result}
        $s = preg_replace_callback('/\$(?!\{)([A-Za-z0-9_]+)\}/', fn($m) => '${' . $m[1] . '}', $s) ?? $s;

        // ${client_phone) => ${client_phone}
        $s = preg_replace_callback('/\$\{([A-Za-z0-9_]+)\)\s*/', fn($m) => '${' . $m[1] . '}', $s) ?? $s;

        return $s;
    }

    private function makeTmpDir(): string
    {
        $base = rtrim(sys_get_temp_dir(), "\\/") . DIRECTORY_SEPARATOR . 'biotrace-tmp-xlsx';
        if (!is_dir($base)) @mkdir($base, 0775, true);

        $dir = $base . DIRECTORY_SEPARATOR . 'xlsx_' . bin2hex(random_bytes(8));
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Unable to create temp dir: {$dir}");
        }
        return $dir;
    }

    private function cleanupDir(string $dir): void
    {
        if (!is_dir($dir)) return;

        $files = scandir($dir);
        if ($files) {
            foreach ($files as $f) {
                if ($f === '.' || $f === '..') continue;

                $p = $dir . DIRECTORY_SEPARATOR . $f;
                if (is_dir($p)) {
                    $this->cleanupDir($p);
                    continue;
                }
                @unlink($p);
            }
        }
        @rmdir($dir);
    }
}
