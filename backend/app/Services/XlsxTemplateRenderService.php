<?php

namespace App\Services;

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

            // choose active sheet + hide others (so LibreOffice export won't dump dozens of sheets)
            if ($preferredSheetName) {
                $sheet = $spreadsheet->getSheetByName($preferredSheetName);
                if ($sheet) {
                    $spreadsheet->setActiveSheetIndex($spreadsheet->getIndex($sheet));

                    foreach ($spreadsheet->getAllSheets() as $ws) {
                        if ($ws->getTitle() !== $preferredSheetName) {
                            $ws->setSheetState(Worksheet::SHEETSTATE_HIDDEN);
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

        $coords = $ws->getCellCollection()->getCoordinates();
        foreach ($coords as $coord) {
            $cell = $ws->getCell($coord);
            $v = $cell->getValue();

            // skip formulas
            if ($cell->isFormula()) continue;

            // RichText
            if ($v instanceof RichText) {
                $changed = false;
                foreach ($v->getRichTextElements() as $el) {
                    if (!method_exists($el, 'getText') || !method_exists($el, 'setText')) continue;
                    $txt = (string) $el->getText();
                    if (strpos($txt, '${') === false) continue;
                    $new = strtr($txt, $map);
                    if ($new !== $txt) {
                        $el->setText($new);
                        $changed = true;
                    }
                }
                if ($changed) $cell->setValue($v);
                continue;
            }

            if (!is_string($v) || trim($v) === '') continue;
            if (strpos($v, '${') === false) continue;

            $new = strtr($v, $map);
            if ($new !== $v) {
                $cell->setValueExplicit($new, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            }
        }
    }

    private function sanitizeKey(string $key): string
    {
        $key = preg_replace('/[^A-Za-z0-9_]/', '_', $key) ?: '';
        return trim($key, '_');
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
