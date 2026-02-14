<?php

namespace App\Services;

use PhpOffice\PhpWord\TemplateProcessor;
use RuntimeException;

class DocxTemplateRenderService
{
    /**
     * Render DOCX template bytes into a merged DOCX (bytes).
     *
     * @param string $templateDocxBytes Original template bytes (docx)
     * @param array<string, string|int|float|null> $vars Placeholder values
     * @param array<string, array<int, array<string, string|int|float|null>>> $rows
     *        Example:
     *        [
     *          'item_no' => [
     *             ['item_no' => 1, 'item_name' => 'Buffer', 'qty' => 2],
     *             ['item_no' => 2, 'item_name' => 'Tube', 'qty' => 5],
     *          ]
     *        ]
     *        Where 'item_no' is the row key used in DOCX (e.g. ${item_no} inside a table row).
     */
    public function renderBytes(string $templateDocxBytes, array $vars = [], array $rows = []): string
    {
        $tmpDir = $this->makeTmpDir();
        $inPath = $tmpDir . DIRECTORY_SEPARATOR . 'template.docx';
        $outPath = $tmpDir . DIRECTORY_SEPARATOR . 'merged.docx';

        file_put_contents($inPath, $templateDocxBytes);

        try {
            $tp = new TemplateProcessor($inPath);

            // scalar placeholders: setValue('record_no', '...') expects ${record_no} in docx
            foreach ($vars as $k => $v) {
                $key = $this->sanitizeKey((string) $k);
                $tp->setValue($key, $v === null ? '' : (string) $v);
            }

            // table rows clone
            foreach ($rows as $rowKey => $rowList) {
                $rk = $this->sanitizeKey((string) $rowKey);

                if (!is_array($rowList)) continue;

                // PhpWord supports cloneRowAndSetValues (best) in newer versions
                if (method_exists($tp, 'cloneRowAndSetValues')) {
                    $values = [];
                    foreach ($rowList as $row) {
                        $flat = [];
                        foreach ($row as $colKey => $colVal) {
                            $flat[$this->sanitizeKey((string) $colKey)] = $colVal === null ? '' : (string) $colVal;
                        }
                        $values[] = $flat;
                    }
                    $tp->cloneRowAndSetValues($rk, $values);
                } else {
                    // fallback: cloneRow + setValue with index suffix #1, #2 ...
                    $n = count($rowList);
                    $tp->cloneRow($rk, $n);
                    for ($i = 0; $i < $n; $i++) {
                        $idx = $i + 1;
                        $row = $rowList[$i];
                        foreach ($row as $colKey => $colVal) {
                            $ck = $this->sanitizeKey((string) $colKey);
                            $tp->setValue($ck . '#' . $idx, $colVal === null ? '' : (string) $colVal);
                        }
                    }
                }
            }

            $tp->saveAs($outPath);

            $merged = file_get_contents($outPath);
            if ($merged === false) {
                throw new RuntimeException('Failed to read merged DOCX output.');
            }

            return $merged;
        } finally {
            $this->cleanupDir($tmpDir);
        }
    }

    private function sanitizeKey(string $key): string
    {
        // keep it simple: alnum + underscore only
        $key = preg_replace('/[^A-Za-z0-9_]/', '_', $key) ?: '';
        return trim($key, '_');
    }

    private function makeTmpDir(): string
    {
        $base = storage_path('app/tmp-docs');
        if (!is_dir($base)) @mkdir($base, 0775, true);

        $dir = $base . DIRECTORY_SEPARATOR . 'docx_' . bin2hex(random_bytes(8));
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
                @unlink($dir . DIRECTORY_SEPARATOR . $f);
            }
        }
        @rmdir($dir);
    }
}